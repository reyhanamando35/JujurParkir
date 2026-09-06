"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { jelaskanGalat } from "@/lib/galat";
import {
  bacaPerangkat,
  COOKIE_PERANGKAT,
  rahasiaBelumDipasang,
} from "@/lib/perangkat";
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
  /** Sisa kuota hari ini setelah kiriman ini. null = tidak diketahui. */
  sisa?: number | null;
};

/**
 * Sama dengan `batas` di pakai_kuota(); dipakai HANYA untuk menyusun kalimat.
 *
 * Tidak diekspor: berkas "use server" cuma boleh mengekspor fungsi async, dan
 * yang menegakkan batasnya memang bukan angka ini melainkan fungsi di basis
 * data. Kalau keduanya berbeda, yang berlaku tetap yang di basis data.
 */
const BATAS_HARIAN = 3;

type HasilKuota = {
  diizinkan: boolean;
  terpakai: number;
  sisa: number;
  reset_pada: string;
};

/**
 * Jam reset dalam kalimat yang bisa dibaca, mis. "besok pukul 00.00 WIB".
 *
 * Waktunya datang dari basis data, bukan dari jam peramban: perangkat yang
 * zonanya salah akan menampilkan waktu reset yang keliru, dan itu justru
 * membuat orang mengira sistemnya rusak.
 */
function kalimatReset(resetPada: string): string {
  const waktu = new Date(resetPada);
  return waktu.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  });
}

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

  const supabase = await createClient();

  /*
    ---- Kuota harian

    Ditempatkan SETELAH seluruh validasi isian dan SEBELUM unggah foto.

    Sesudah validasi, supaya formulir yang salah isi tidak memakan jatah —
    orang yang salah pilih jenis lalu memperbaikinya tidak boleh kehilangan
    satu dari tiga kesempatannya.

    Sebelum unggah, supaya kiriman keempat ditolak tanpa lebih dulu menaruh
    berkas di storage yang tidak akan pernah dirujuk baris mana pun.

    Keputusan menolak ada di sini dan di fungsi basis datanya, tidak pernah di
    peramban. localStorage di sisi klien hanya memajang sisa kuota; ia tidak
    pernah ditanya boleh atau tidak.
  */
  const jar = await cookies();
  const perangkat = bacaPerangkat(jar.get(COOKIE_PERANGKAT)?.value);

  if (!perangkat && rahasiaBelumDipasang()) {
    // Salah konfigurasi, bukan salah warga. Dicatat keras-keras, tapi jalur
    // lapornya TIDAK ditutup: warga yang tidak bisa melapor karena env kita
    // belum lengkap adalah kegagalan yang lebih buruk daripada batas yang
    // tidak berjalan sehari.
    console.error(
      "[lapor] KUOTA_RAHASIA belum dipasang — batas kirim harian TIDAK berjalan.",
    );
  }

  let sisaKuota: number | null = null;

  if (perangkat) {
    const { data, error } = await supabase.rpc("pakai_kuota", {
      perangkat,
    });

    if (error) {
      // Sama seperti di atas: kegagalan sistem kuota tidak boleh jadi alasan
      // menolak laporan warga. Dicetak supaya ketahuan, lalu dilewati.
      console.error(`[lapor] kuota gagal diperiksa: ${jelaskanGalat(error)}`);
    } else {
      const hasil = (data as HasilKuota[] | null)?.[0] ?? null;
      if (hasil && !hasil.diizinkan) {
        return {
          pesan: `Kamu sudah mengirim ${BATAS_HARIAN} laporan hari ini — batas hariannya tercapai. Hitungannya dimulai lagi pada ${kalimatReset(hasil.reset_pada)}. Kalau ada yang mendesak, laporan yang sudah masuk tetap diproses petugas.`,
          kode: null,
          sisa: 0,
        };
      }
      sisaKuota = hasil?.sisa ?? null;
    }
  }

  /** Mengembalikan jatah yang sudah terpakai saat langkah sesudahnya gagal. */
  const kembalikanKuota = async () => {
    if (!perangkat || sisaKuota === null) return;
    const { error } = await supabase.rpc("batal_kuota", { perangkat });
    if (error) {
      console.error(`[lapor] kuota gagal dikembalikan: ${jelaskanGalat(error)}`);
    }
  };

  // ---- Foto
  const foto = formData.get("foto");
  let fotoPath: string | null = null;

  if (foto instanceof File && foto.size > 0) {
    if (foto.size > BATAS_FOTO_BYTE) {
      await kembalikanKuota();
      return gagal("Foto terlalu besar. Maksimal 10 MB.");
    }
    // Klien sudah menyandikan ulang jadi JPEG lewat Canvas untuk membuang EXIF.
    // Di sini tipenya diperiksa lagi supaya berkas yang dikirim langsung ke
    // Server Action (melewati form) tidak bisa menyelundupkan format lain.
    if (foto.type !== "image/jpeg") {
      await kembalikanKuota();
      return gagal("Format foto tidak didukung. Kirim ulang lewat formulir.");
    }

    const nama = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("laporan-foto")
      .upload(nama, foto, { contentType: "image/jpeg", upsert: false });

    if (error) {
      console.error("[lapor] unggah foto gagal:", error);
      await kembalikanKuota();
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
    await kembalikanKuota();
    return gagal(
      "Laporan gagal terkirim. Periksa koneksi, isian kamu masih tersimpan di formulir.",
    );
  }

  return { pesan: null, kode, sisa: sisaKuota };
}
