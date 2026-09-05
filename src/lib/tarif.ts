/**
 * Tarif rujukan parkir tepi jalan umum.
 *
 * ================== BACA INI SEBELUM MENGUBAH ==================
 * Angka di bawah masih ANGKA CONTOH, bukan kutipan Perda 7/2023.
 *
 * Sengaja TIDAK ada nomor pasal di berkas ini selama `SUMBER_TARIF.resmi`
 * masih false. Angka karangan yang diberi label pasal akan terbaca sebagai
 * kutipan hukum, dan warga yang memakainya untuk berdebat dengan jukir bisa
 * dirugikan justru oleh aplikasi yang seharusnya melindunginya.
 *
 * Cara menggantinya dengan tabel asli:
 *   1. Ganti isi TARIF dengan angka Perda per kategori.
 *   2. Set SUMBER_TARIF.resmi = true.
 *   3. Isi SUMBER_TARIF.rujukan dengan nomor Perda + pasal/lampirannya.
 * Tidak ada berkas lain yang perlu disentuh — seluruh label di peta membaca
 * penanda ini.
 * ===============================================================
 */

export type KategoriTarif = "non_zona" | "zona" | "insidentil" | "petak_khusus";
export type JenisKendaraan = "motor" | "mobil";

export const SUMBER_TARIF = {
  /** false = angka contoh. true = sudah diisi dari Perda dan boleh disitasi. */
  resmi: false,
  rujukan: "Angka contoh, belum diisi dari Perda 7/2023",
} as const;

/** Rupiah sekali parkir, per kategori dan jenis kendaraan. */
export const TARIF: Record<KategoriTarif, Record<JenisKendaraan, number>> = {
  non_zona: { motor: 1000, mobil: 2000 },
  zona: { motor: 2000, mobil: 4000 },
  insidentil: { motor: 3000, mobil: 5000 },
  petak_khusus: { motor: 2500, mobil: 5000 },
};

export const NAMA_KENDARAAN: Record<JenisKendaraan, string> = {
  motor: "Motor",
  mobil: "Mobil",
};

/**
 * Rentang lintas SELURUH kategori, bukan satu angka.
 *
 * Kategori tarif tiap titik belum diketahui — Perda tidak memetakan alamat ke
 * kategori — jadi satu-satunya pernyataan yang jujur untuk sebuah titik adalah
 * "tarifnya berada di antara sekian dan sekian".
 */
export function rentangTarif(kendaraan: JenisKendaraan): {
  min: number;
  maks: number;
} {
  const nilai = Object.values(TARIF).map((k) => k[kendaraan]);
  return { min: Math.min(...nilai), maks: Math.max(...nilai) };
}

export function rupiah(nilai: number): string {
  return `Rp${nilai.toLocaleString("id-ID")}`;
}

/** Teks rentang siap tampil, mis. "Rp1.000–Rp3.000". */
export function teksRentang(kendaraan: JenisKendaraan): string {
  const { min, maks } = rentangTarif(kendaraan);
  return min === maks ? rupiah(min) : `${rupiah(min)}–${rupiah(maks)}`;
}
