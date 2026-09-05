/**
 * Label laporan dalam bahasa manusia.
 *
 * Satu tempat untuk tiga pembaca yang berbeda: dasbor petugas, halaman
 * verifikasi, dan halaman cek status warga. Kalau daftarnya disalin ke
 * masing-masing halaman, cepat atau lambat warga membaca "selesai" sementara
 * petugas membaca "Selesai ditangani" untuk baris yang sama.
 */

export const STATUS_LAPORAN = [
  "baru",
  "proses",
  "selesai",
  "ditolak",
] as const;

export type StatusLaporan = (typeof STATUS_LAPORAN)[number];

export function adalahStatus(nilai: string): nilai is StatusLaporan {
  return (STATUS_LAPORAN as readonly string[]).includes(nilai);
}

/** Label untuk petugas — kalimat kerja, dilihat dari sisi yang menindaklanjuti. */
export const LABEL_STATUS: Record<StatusLaporan, string> = {
  baru: "Baru",
  proses: "Sedang diproses",
  selesai: "Selesai ditangani",
  ditolak: "Tidak terbukti",
};

/**
 * Label untuk warga — kalimat yang menjawab "laporan saya bagaimana?".
 *
 * Sengaja berbeda dari label petugas. "Ditolak" terbaca seperti pelapornya
 * yang ditolak; yang sebenarnya terjadi adalah laporannya diperiksa dan tidak
 * terbukti. Kata itu menentukan apakah orangnya mau melapor lagi lain kali.
 */
export const LABEL_STATUS_WARGA: Record<StatusLaporan, string> = {
  baru: "Sudah masuk, menunggu diperiksa",
  proses: "Sedang diperiksa petugas",
  selesai: "Sudah ditindaklanjuti",
  ditolak: "Sudah diperiksa, tidak terbukti",
};

export const LABEL_JENIS: Record<string, string> = {
  tarif_lebih: "Tarif melebihi ketentuan",
  tanpa_karcis: "Karcis tidak diberikan",
  parkir_liar: "Parkir sembarangan",
  pungutan_area_gratis: "Pungutan di area gratis",
  perilaku: "Perilaku petugas",
  tanpa_atribut: "Jukir tanpa atribut",
  lokasi_tak_terdaftar: "Lokasi tidak terdaftar",
  lainnya: "Lainnya",
};

export const LABEL_JALUR: Record<string, string> = {
  terdaftar: "Titik resmi",
  luar_daftar: "Di luar daftar",
};

/** Nilai tak dikenal ditampilkan apa adanya, bukan disembunyikan atau diganti
 *  tanda hubung — kalau ada jenis baru masuk basis data, itu harus kelihatan. */
export function labelJenis(nilai: string): string {
  return LABEL_JENIS[nilai] ?? nilai;
}

export function labelJalur(nilai: string): string {
  return LABEL_JALUR[nilai] ?? nilai;
}
