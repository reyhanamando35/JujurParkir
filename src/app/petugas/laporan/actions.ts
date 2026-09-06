"use server";

import { revalidatePath } from "next/cache";

import { getPetugas } from "@/lib/auth";
import { jelaskanGalat } from "@/lib/galat";
import { adalahStatus } from "@/lib/laporan";
import { createClient } from "@/lib/supabase/server";

export type StatusUbah = {
  pesan: string | null;
  berhasil: boolean;
};

const BATAS_TINDAK_LANJUT = 500;

/**
 * Menindaklanjuti satu laporan warga.
 *
 * Yang perlu diperhatikan soal keamanannya: fungsi ini TIDAK memeriksa apakah
 * laporan yang disentuh berada di wilayah petugas yang bersangkutan. Itu bukan
 * kelalaian — pemeriksaannya ada di policy "petugas ubah laporan" di basis
 * data, dan di situlah tempatnya. Kalau Katar mencoba menyentuh laporan wilayah
 * lain, RLS membuat update-nya mengenai NOL baris, dan itu yang dideteksi di
 * bawah.
 *
 * Menaruh pemeriksaan yang sama di sini berarti dua sumber kebenaran yang bisa
 * berbeda isi, dan yang di aplikasi selalu yang lebih dulu usang.
 */
export async function ubahStatusLaporan(
  _sebelumnya: StatusUbah,
  formData: FormData,
): Promise<StatusUbah> {
  const gagal = (pesan: string): StatusUbah => ({ pesan, berhasil: false });

  const petugas = await getPetugas();
  if (!petugas) {
    return gagal("Sesimu sudah berakhir. Muat ulang halaman dan masuk lagi.");
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return gagal("Laporan yang dimaksud tidak dikenali.");
  }

  const status = String(formData.get("status") ?? "");
  if (!adalahStatus(status)) {
    return gagal("Status itu tidak dikenali.");
  }

  const tindakLanjut = String(formData.get("tindak_lanjut") ?? "").trim();

  // Wajib untuk dua status akhir. Ini bukan formalitas: "tidak terbukti" tanpa
  // penjelasan adalah persis bentuk kegagalan yang bikin warga berhenti
  // melapor — dan kolom ini yang dibaca warga di halaman cek status.
  if ((status === "selesai" || status === "ditolak") && tindakLanjut.length === 0) {
    return gagal(
      "Isi dulu tindak lanjutnya. Warga akan membaca keterangan ini saat mengecek kode laporannya.",
    );
  }
  if (tindakLanjut.length > BATAS_TINDAK_LANJUT) {
    return gagal(`Tindak lanjut maksimal ${BATAS_TINDAK_LANJUT} karakter.`);
  }

  const supabase = await createClient();

  // Hanya empat kolom ini yang dikirim, dan hanya empat kolom ini pula yang
  // boleh disentuh peran authenticated (lihat grant kolom di 0006).
  const { data, error } = await supabase
    .from("laporan")
    .update({
      status,
      tindak_lanjut: tindakLanjut.length > 0 ? tindakLanjut : null,
      ditangani_oleh: petugas.id,
      status_diubah_pada: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    // Dicetak, bukan ditelan: tanpa jejak ini, penyebab sebenarnya — kolom yang
    // belum ada karena 0006 belum dijalankan, atau grant yang menolak — tidak
    // kelihatan sama sekali oleh yang memperbaikinya.
    console.error("[laporan] gagal mengubah status:", error);
    return gagal("Status gagal disimpan. Coba lagi.");
  }

  if (!data || data.length === 0) {
    // Nol baris berarti RLS menolak. Pesannya sengaja tidak menyatakan bahwa
    // laporannya ada — Katar tidak perlu tahu apa yang terjadi di wilayah lain.
    return gagal("Laporan itu berada di luar cakupan wilayahmu.");
  }

  revalidatePath("/petugas/laporan");
  revalidatePath("/petugas/dasbor");

  return { pesan: "Tindak lanjut tersimpan.", berhasil: true };
}

export type StatusFoto = {
  url: string | null;
  pesan: string | null;
};

/**
 * Berapa lama tautan foto berlaku. Cukup untuk membukanya, tidak cukup untuk
 * jadi tautan yang bisa dibagikan.
 */
const UMUR_TAUTAN_DETIK = 60;

/**
 * Membuka foto satu laporan sebagai signed URL berumur pendek.
 *
 * Bucket 'laporan-foto' private (0004:185) dan tidak akan pernah dibuat
 * publik: fotonya bisa memuat wajah, pelat nomor, dan isi dompet orang yang
 * tidak pernah menyetujui apa pun selain "kirim laporan".
 *
 * Tiga hal yang disengaja:
 *
 * 1. Path-nya TIDAK pernah ikut dikirim ke peramban bersama daftar laporan.
 *    View laporan_petugas hanya mengeluarkan `foto_path is not null as
 *    ada_foto` (0006:83), dan itu dibiarkan begitu. Yang sampai ke klien
 *    hanya tautan bertanda tangan, hanya ketika petugas benar-benar memintanya.
 *
 * 2. Tidak ada pemeriksaan wilayah di sini, dan itu bukan kelalaian —
 *    sama seperti ubahStatusLaporan di atas. `select` di bawah tunduk pada
 *    policy "petugas baca laporan"; Katar yang meminta foto laporan wilayah
 *    lain mendapat nol baris, bukan foto. Signed URL-nya sendiri juga hanya
 *    terbit kalau policy "petugas baca foto laporan" (0004:200) meloloskan,
 *    yang menuntut adanya baris di tabel petugas.
 *
 * 3. Umurnya pendek dan tidak diperpanjang. Tautan yang menganggur di riwayat
 *    peramban atau tertempel di percakapan grup berhenti berlaku sendiri.
 */
export async function lihatFotoLaporan(
  _sebelumnya: StatusFoto,
  formData: FormData,
): Promise<StatusFoto> {
  const gagal = (pesan: string): StatusFoto => ({ url: null, pesan });

  const petugas = await getPetugas();
  if (!petugas) {
    return gagal("Sesimu sudah berakhir. Muat ulang halaman dan masuk lagi.");
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return gagal("Laporan yang dimaksud tidak dikenali.");
  }

  const supabase = await createClient();

  // Dibaca dari tabelnya langsung, bukan dari view: foto_path memang sengaja
  // tidak ada di laporan_petugas, dan tetap tidak perlu ditambahkan ke sana.
  const { data, error } = await supabase
    .from("laporan")
    .select("foto_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[laporan] gagal membaca foto_path: ${jelaskanGalat(error)}`);
    return gagal("Foto gagal dibuka. Coba lagi.");
  }

  // Nol baris berarti RLS menolak — laporan ini di luar wilayahmu. Jawabannya
  // sengaja tidak membedakan itu dari "laporannya tidak ada": kalau dibedakan,
  // tombol ini jadi alat untuk memetakan laporan di wilayah orang lain.
  const path = data?.foto_path ?? null;
  if (!path) {
    return gagal("Laporan ini tidak punya foto yang bisa dibuka.");
  }

  const { data: tanda, error: galatTanda } = await supabase.storage
    .from("laporan-foto")
    .createSignedUrl(path, UMUR_TAUTAN_DETIK);

  if (galatTanda || !tanda?.signedUrl) {
    console.error(
      `[laporan] gagal menandatangani URL foto: ${jelaskanGalat(galatTanda)}`,
    );
    return gagal("Foto gagal dibuka. Coba lagi.");
  }

  return { url: tanda.signedUrl, pesan: null };
}
