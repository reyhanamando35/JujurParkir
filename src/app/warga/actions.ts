"use server";

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { turunkanWilayah } from "@/lib/wilayah-titik";

/**
 * Pengiriman laporan warga.
 *
 * Yang TIDAK pernah dibaca atau disimpan di sini: alamat IP, user agent, dan
 * header apa pun yang bisa menunjuk ke pengirim. Laporan ini anonim, dan
 * anonimitasnya dijaga dengan tidak pernah mengambil datanya sejak awal —
 * bukan dengan menghapusnya belakangan.
 */

export type StatusLapor = {
  pesan: string | null;
  kode: string | null;
};

/**
 * Jenis yang sah BERGANTUNG pada jalurnya. Dicocokkan lagi di sini, bukan cuma
 * di form: tanpa ini, permintaan yang dirakit tangan bisa mengirim laporan
 * "pungutan di area gratis" pada sebuah titik parkir resmi — kombinasi yang
 * tidak punya arti dan akan menyesatkan petugas yang menindaklanjutinya.
 */
const JENIS_PER_JALUR = {
  terdaftar: ["tarif_lebih", "parkir_liar", "lainnya"],
  luar_daftar: ["pungutan_area_gratis", "parkir_liar", "lainnya"],
} as const;

const KENDARAAN_SAH = ["motor", "mobil"] as const;

const BATAS_CATATAN = 500;
const BATAS_FOTO_BYTE = 10 * 1024 * 1024;

/**
 * Huruf yang mudah tertukar (0/O, 1/I/L) dibuang: kodenya akan dibacakan lewat
 * telepon atau ditulis tangan di pinggir jalan.
 */
const ALFABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function buatKode(): string {
  const acak = new Uint32Array(6);
  crypto.getRandomValues(acak);
  return Array.from(acak, (n) => ALFABET[n % ALFABET.length]).join("");
}

export async function kirimLaporan(
  _sebelumnya: StatusLapor,
  formData: FormData,
): Promise<StatusLapor> {
  const gagal = (pesan: string): StatusLapor => ({ pesan, kode: null });

  // Honeypot. Field ini tersembunyi dari manusia; yang mengisinya hampir pasti
  // bot pengisi formulir otomatis. Ditolak diam-diam tanpa memberi tahu alasan
  // sebenarnya, supaya polanya tidak gampang dipelajari.
  if (String(formData.get("sapaan") ?? "").trim().length > 0) {
    return gagal("Laporan tidak bisa dikirim. Coba lagi sebentar lagi.");
  }

  // ---- Validasi ulang. Validasi di klien hanya untuk kenyamanan; yang
  // ---- menentukan adalah yang di sini.
  const jalur = String(formData.get("jalur") ?? "");
  if (jalur !== "terdaftar" && jalur !== "luar_daftar") {
    return gagal("Lokasi laporan belum dipilih.");
  }

  const jenis = String(formData.get("jenis") ?? "");
  if (!(JENIS_PER_JALUR[jalur] as readonly string[]).includes(jenis)) {
    return gagal("Pilih dulu apa yang kamu alami.");
  }

  const kendaraan = String(formData.get("jenis_kendaraan") ?? "");
  if (!(KENDARAAN_SAH as readonly string[]).includes(kendaraan)) {
    return gagal("Pilih jenis kendaraan.");
  }

  const catatan = String(formData.get("catatan") ?? "").trim();
  if (catatan.length === 0) {
    return gagal("Keterangan wajib diisi — ceritakan apa yang kamu alami.");
  }
  if (catatan.length > BATAS_CATATAN) {
    return gagal(`Keterangan maksimal ${BATAS_CATATAN} karakter.`);
  }

  const waktuMentah = String(formData.get("waktu_kejadian") ?? "").trim();
  const waktu = waktuMentah.length > 0 ? new Date(waktuMentah) : new Date();
  if (Number.isNaN(waktu.getTime())) {
    return gagal("Waktu kejadian tidak terbaca.");
  }
  // Kejadian di masa depan tidak masuk akal; diberi kelonggaran satu jam untuk
  // jam perangkat yang meleset.
  if (waktu.getTime() > Date.now() + 3600_000) {
    return gagal("Waktu kejadian tidak boleh di masa depan.");
  }

  // ---- Lokasi
  let titikKode: string | null = null;
  let lokasiWkt: string | null = null;
  let bagianKota: string | null = null;

  if (jalur === "terdaftar") {
    const kode = String(formData.get("titik_kode") ?? "").trim();
    // Kode titik selalu 8 heksadesimal, kadang dengan sufiks -2 untuk baris
    // kembar. Apa pun di luar pola itu tidak berasal dari peta kita.
    if (!/^[0-9a-f]{8}(-\d+)?$/.test(kode)) {
      return gagal("Titik parkir yang dilaporkan tidak dikenali.");
    }
    titikKode = kode;
    const w = String(formData.get("bagian_kota") ?? "").trim();
    bagianKota = ["Pusat", "Utara", "Timur", "Selatan", "Barat"].includes(w)
      ? w
      : null;
  } else {
    const lat = Number(formData.get("lat"));
    const lng = Number(formData.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return gagal("Titik di peta belum ditandai.");
    }
    // Kotak Kota Surabaya. Koordinat di luar ini tidak mungkin berasal dari pin
    // yang digeser di peta kita.
    if (lat < -7.4 || lat > -7.15 || lng < 112.55 || lng > 112.88) {
      return gagal("Titik yang ditandai berada di luar Kota Surabaya.");
    }
    lokasiWkt = `SRID=4326;POINT(${lng} ${lat})`;
    bagianKota = turunkanWilayah(lat, lng);
  }

  // ---- Foto
  const foto = formData.get("foto");
  let fotoPath: string | null = null;
  const supabase = await createClient();

  if (foto instanceof File && foto.size > 0) {
    if (foto.size > BATAS_FOTO_BYTE) {
      return gagal("Foto terlalu besar. Maksimal 10 MB.");
    }
    // Klien sudah menyandikan ulang jadi JPEG lewat Canvas untuk membuang EXIF.
    // Di sini tipenya diperiksa lagi supaya berkas yang dikirim langsung ke
    // Server Action (melewati form) tidak bisa menyelundupkan format lain.
    if (foto.type !== "image/jpeg") {
      return gagal("Format foto tidak didukung. Kirim ulang lewat formulir.");
    }

    const nama = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("laporan-foto")
      .upload(nama, foto, { contentType: "image/jpeg", upsert: false });

    if (error) {
      console.error("[lapor] unggah foto gagal:", error);
      return gagal("Foto gagal diunggah. Coba kirim lagi tanpa foto.");
    }
    fotoPath = nama;
  }

  // ---- Simpan
  const kode = buatKode();
  const { error } = await supabase.from("laporan").insert({
    jalur,
    titik_kode: titikKode,
    lokasi: lokasiWkt,
    bagian_kota: bagianKota,
    jenis,
    jenis_kendaraan: kendaraan,
    waktu_kejadian: waktu.toISOString(),
    catatan,
    foto_path: fotoPath,
    kode,
  });

  if (error) {
    // Dicetak, bukan ditelan. Pesan untuk pengguna sengaja umum, tapi tanpa
    // jejak ini penyebab sebenarnya — kolom yang belum ada, constraint yang
    // ditolak — tidak kelihatan sama sekali oleh yang memperbaikinya.
    console.error("[lapor] simpan laporan gagal:", error);
    return gagal(
      "Laporan gagal terkirim. Periksa koneksi, isian kamu masih tersimpan di formulir.",
    );
  }

  return { pesan: null, kode };
}
