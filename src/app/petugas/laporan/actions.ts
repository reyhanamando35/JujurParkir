"use server";

import { revalidatePath } from "next/cache";

import { getPetugas } from "@/lib/auth";
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
