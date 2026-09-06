"use server";

import { revalidatePath } from "next/cache";

import { getPetugas } from "@/lib/auth";
import { jelaskanGalat } from "@/lib/galat";
import { createClient } from "@/lib/supabase/server";

export type StatusTitik = {
  pesan: string | null;
  berhasil: boolean;
};

/**
 * Kosakata `titik_parkir.sumber_kategori`, dari CHECK di 0001.
 *
 * Ini memang disalin ke kode — berbeda dari kategori tarif, yang sejak 0009
 * hidup di tabel referensi. Bedanya: kategori bisa bertambah kalau Perda baru
 * menambah zona, sedangkan daftar JENIS DASAR HUKUM tidak bertambah karena
 * keputusan tarif. Kalau nanti berubah, yang menahan tetap CHECK di basis data.
 */
const SUMBER_KATEGORI = ["perda", "kepwal", "uptd", "belum_verif"] as const;

/**
 * Menetapkan kategori tarif dan mode bayar satu titik parkir.
 *
 * Semua nilainya boleh dikosongkan lagi. Mengosongkan bukan "membatalkan
 * pekerjaan" — null berarti "belum diverifikasi", dan mengembalikan sebuah
 * titik ke keadaan itu adalah tindakan yang sah kalau penetapan sebelumnya
 * ternyata keliru. Peta akan kembali menampilkan rentang, yang selalu benar.
 *
 * Pemeriksaan peran ada di sini DAN di policy 0011. Yang di sini memberi pesan
 * yang bisa dibaca; yang di basis data yang benar-benar menegakkan — Katar yang
 * memanggil endpoint ini langsung dari konsol peramban tetap ditolak Postgres.
 */
export async function simpanAtributTitik(
  _sebelumnya: StatusTitik,
  formData: FormData,
): Promise<StatusTitik> {
  const gagal = (pesan: string): StatusTitik => ({ pesan, berhasil: false });

  const petugas = await getPetugas();
  if (!petugas) {
    return gagal("Sesimu sudah berakhir. Muat ulang halaman dan masuk lagi.");
  }
  if (petugas.peran !== "dishub") {
    return gagal("Hanya petugas Dishub yang bisa menetapkan kategori titik.");
  }

  const kode = String(formData.get("kode_titik") ?? "").trim();
  if (kode.length === 0) return gagal("Titik yang diubah tidak dikenali.");

  const kategoriMentah = String(formData.get("kategori_tarif") ?? "").trim();
  const kategori = kategoriMentah.length > 0 ? kategoriMentah : null;

  const sumberMentah = String(formData.get("sumber_kategori") ?? "").trim();
  const sumber = sumberMentah.length > 0 ? sumberMentah : null;
  if (sumber !== null && !(SUMBER_KATEGORI as readonly string[]).includes(sumber)) {
    return gagal("Dasar penetapannya tidak dikenali.");
  }

  const progresifMentah = String(formData.get("progresif") ?? "").trim();
  const progresif =
    progresifMentah === "ya" ? true : progresifMentah === "tidak" ? false : null;

  // Dua pemeriksaan yang menjaga arti kolomnya, bukan sekadar bentuk datanya.
  //
  // Kategori tanpa dasar tidak akan pernah dipakai menyempitkan angka di peta
  // (lihat `sumberMengikat`), jadi menyimpannya begitu saja berarti membuat
  // penetapan yang diam-diam tidak berpengaruh apa-apa.
  if (kategori !== null && sumber === null) {
    return gagal(
      "Sebutkan dasar penetapannya. Kategori tanpa dasar tidak dipakai di peta warga.",
    );
  }
  // Dan sebaliknya: dasar hukum tanpa kategori tidak menetapkan apa pun.
  if (kategori === null && sumber !== null) {
    return gagal("Pilih kategori tarifnya, atau kosongkan juga dasarnya.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("titik_parkir")
    .update({
      kategori_tarif: kategori,
      sumber_kategori: sumber,
      progresif,
    })
    .eq("kode_titik", kode)
    // Alamatnya ikut diambil supaya pesan berhasil bisa menyebut titik MANA.
    // Setelah tersimpan, barisnya sering keluar dari daftar yang sedang
    // disaring, jadi pesan tanpa nama tidak menunjuk apa pun lagi.
    .select("kode_titik, alamat");

  if (error) {
    if (error.code === "23503" || error.code === "23514") {
      return gagal("Kategori itu tidak ada di daftar kategori tarif.");
    }
    console.error(`[titik] gagal menyimpan atribut: ${jelaskanGalat(error)}`);
    return gagal("Penetapan gagal disimpan. Coba lagi.");
  }
  if (!data || data.length === 0) {
    // Nol baris berarti policy menolak atau kodenya sudah tidak ada — dua-duanya
    // bukan "berhasil", dan tidak boleh dilaporkan sebagai berhasil.
    return gagal("Titik itu tidak bisa diubah dengan akunmu.");
  }

  const alamat = String((data[0] as { alamat?: unknown }).alamat ?? "").trim();
  const sebutan = alamat.length > 0 ? alamat : kode;

  revalidatePath("/petugas/titik");
  return {
    pesan:
      kategori === null && progresif === null
        ? `Penetapan ${sebutan} dikosongkan. Titik itu kembali ditampilkan sebagai rentang di peta warga.`
        : `Penetapan ${sebutan} disimpan.`,
    berhasil: true,
  };
}
