"use server";

import { revalidatePath } from "next/cache";

import { getPetugas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StatusTarif = {
  pesan: string | null;
  berhasil: boolean;
};

const KENDARAAN = ["motor", "mobil"] as const;
const MODE = ["progresif", "non_progresif"] as const;

const BATAS_SUMBER = 200;
/** Satu kali parkir tepi jalan tidak mungkin jutaan; angka di atas ini pasti salah ketik. */
const BATAS_RUPIAH = 1_000_000;

/**
 * Angka opsional dari formulir.
 *
 * Kosong berarti "tidak ditetapkan Perda" dan disimpan sebagai null — berbeda
 * dari 0, yang berarti "gratis". Dua hal itu tidak boleh tertukar.
 */
function bacaRupiah(nilai: FormDataEntryValue | null): number | null | "galat" {
  const teks = String(nilai ?? "").trim();
  if (teks.length === 0) return null;
  const angka = Number(teks.replace(/[^\d]/g, ""));
  if (!Number.isFinite(angka) || angka < 0 || angka > BATAS_RUPIAH) {
    return "galat";
  }
  return Math.round(angka);
}

/**
 * Menyimpan satu baris tarif — menambah kalau tanpa id, memperbarui kalau ada.
 *
 * Pemeriksaan peran ada DI SINI dan di policy basis data, dan keduanya memang
 * disengaja. Yang di sini memberi pesan yang bisa dibaca manusia; yang di basis
 * data yang benar-benar menegakkan — Katar yang memanggil endpoint ini langsung
 * dari konsol peramban tetap ditolak Postgres, bukan oleh kode ini.
 *
 * Daftar kategori TIDAK divalidasi ulang di sini. Sejak 0009 kosakatanya hidup
 * di tabel `kategori_tarif` dan ditegakkan foreign key; menyalinnya ke sini
 * berarti dua daftar yang bisa berbeda isi, dan yang di aplikasi selalu yang
 * lebih dulu usang.
 */
export async function simpanTarif(
  _sebelumnya: StatusTarif,
  formData: FormData,
): Promise<StatusTarif> {
  const gagal = (pesan: string): StatusTarif => ({ pesan, berhasil: false });

  const petugas = await getPetugas();
  if (!petugas) {
    return gagal("Sesimu sudah berakhir. Muat ulang halaman dan masuk lagi.");
  }
  if (petugas.peran !== "dishub") {
    return gagal("Hanya petugas Dishub yang bisa menetapkan tarif.");
  }

  const idMentah = String(formData.get("id") ?? "").trim();
  const id = idMentah.length > 0 ? Number(idMentah) : null;
  if (id !== null && (!Number.isInteger(id) || id <= 0)) {
    return gagal("Baris tarif yang diubah tidak dikenali.");
  }

  const kategori = String(formData.get("kategori") ?? "").trim();
  if (kategori.length === 0) return gagal("Pilih kategori tarifnya.");

  const kendaraan = String(formData.get("jenis_kendaraan") ?? "");
  if (!(KENDARAAN as readonly string[]).includes(kendaraan)) {
    return gagal("Pilih jenis kendaraan.");
  }

  const mode = String(formData.get("mode") ?? "");
  if (!(MODE as readonly string[]).includes(mode)) {
    return gagal("Pilih mode tarifnya.");
  }

  const awal = bacaRupiah(formData.get("tarif_awal"));
  const perJam = bacaRupiah(formData.get("tarif_per_jam"));
  const maks = bacaRupiah(formData.get("tarif_maks"));
  if (awal === "galat" || perJam === "galat" || maks === "galat") {
    return gagal(
      `Nominal harus angka antara 0 dan ${BATAS_RUPIAH.toLocaleString("id-ID")}.`,
    );
  }

  // Baris tanpa satu pun angka tidak menyatakan apa pun, tapi tetap akan
  // dihitung sebagai "tarif sudah ditetapkan" oleh peta.
  if (awal === null && perJam === null && maks === null) {
    return gagal("Isi minimal satu nominal tarifnya.");
  }
  if (awal !== null && maks !== null && maks < awal) {
    return gagal("Tarif maksimum tidak boleh lebih kecil daripada tarif awal.");
  }

  const sumber = String(formData.get("sumber") ?? "").trim();
  // Kolomnya NOT NULL di basis data, tapi ditolak di sini juga supaya pesannya
  // menjelaskan KENAPA — bukan sekadar galat constraint.
  if (sumber.length === 0) {
    return gagal(
      "Sumber wajib diisi. Setiap angka tarif harus bisa ditelusuri ke pasal atau lampirannya.",
    );
  }
  if (sumber.length > BATAS_SUMBER) {
    return gagal(`Sumber maksimal ${BATAS_SUMBER} karakter.`);
  }

  const isi = {
    kategori,
    jenis_kendaraan: kendaraan,
    mode,
    tarif_awal: awal,
    tarif_per_jam: perJam,
    tarif_maks: maks,
    sumber,
  };

  const supabase = await createClient();
  const { error } =
    id === null
      ? await supabase.from("tarif").insert(isi)
      : await supabase.from("tarif").update(isi).eq("id", id);

  if (error) {
    // Dua galat basis data yang punya penjelasan manusiawi. Sisanya umum.
    if (error.code === "23505") {
      return gagal(
        "Kombinasi kategori, kendaraan, dan mode itu sudah ada. Ubah baris yang sudah ada, jangan menambah yang baru.",
      );
    }
    if (error.code === "23503") {
      return gagal("Kategori itu tidak ada di daftar kategori tarif.");
    }
    console.error("[tarif] gagal menyimpan:", error);
    return gagal("Tarif gagal disimpan. Coba lagi.");
  }

  revalidatePath("/petugas/tarif");
  return {
    pesan: id === null ? "Tarif ditambahkan." : "Tarif diperbarui.",
    berhasil: true,
  };
}

export async function hapusTarif(
  _sebelumnya: StatusTarif,
  formData: FormData,
): Promise<StatusTarif> {
  const gagal = (pesan: string): StatusTarif => ({ pesan, berhasil: false });

  const petugas = await getPetugas();
  if (!petugas || petugas.peran !== "dishub") {
    return gagal("Hanya petugas Dishub yang bisa menghapus tarif.");
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return gagal("Baris tarif tidak dikenali.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarif")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[tarif] gagal menghapus:", error);
    return gagal("Tarif gagal dihapus. Coba lagi.");
  }
  if (!data || data.length === 0) {
    // Nol baris berarti RLS menolak, bukan barisnya tidak ada.
    return gagal("Tarif itu tidak bisa dihapus dengan akunmu.");
  }

  revalidatePath("/petugas/tarif");
  return { pesan: "Tarif dihapus.", berhasil: true };
}
