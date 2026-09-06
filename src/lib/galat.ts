/**
 * Merangkai galat Supabase jadi satu baris teks yang benar-benar terbaca.
 *
 * Kenapa perlu: `console.error("pesan:", error)` menampilkan isi objeknya di
 * console peramban, tapi overlay galat Next.js merangkainya jadi "{}". Jadi di
 * tempat yang paling mungkin dilihat orang saat mengembangkan — kotak merah
 * yang menutupi layar — justru alasannya yang hilang, dan yang tersisa hanya
 * nomor baris.
 *
 * Objek galatnya juga bukan Error biasa: `PostgrestError` punya message,
 * details, hint, dan code sebagai properti biasa, sehingga tidak ada satu pun
 * perangkai bawaan yang menampilkannya utuh.
 *
 * Selalu pakai lewat interpolasi string, bukan sebagai argumen kedua:
 *
 *     console.error(`[peta] gagal memuat: ${jelaskanGalat(error)}`);
 */

/** Bentuk galat dari supabase-js. Sengaja lepas, supaya menerima galat apa pun. */
type GalatSupabase = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

/**
 * Migrasi yang belum dijalankan adalah penyebab tersering di proyek ini, dan
 * galat Postgres-nya menyebut nama kolom atau relasi tanpa menyebut apa yang
 * harus dilakukan. Petunjuknya ditambahkan di sini supaya tidak perlu dihafal.
 *
 *   42703 undefined_column   42P01 undefined_table   42501 kurang hak akses
 */
const PETUNJUK: Record<string, string> = {
  "42703": "Kolomnya belum ada — ada migrasi yang belum dijalankan.",
  "42P01": "Tabel atau view-nya belum ada — ada migrasi yang belum dijalankan.",
  "42501": "Ditolak hak akses. Periksa grant dan policy-nya.",
};

function teks(nilai: unknown): string {
  return typeof nilai === "string" && nilai.trim().length > 0 ? nilai.trim() : "";
}

export function jelaskanGalat(galat: unknown): string {
  if (galat === null || galat === undefined) return "galat tanpa keterangan";
  if (typeof galat === "string") return galat;

  const g = galat as GalatSupabase;
  const pesan = teks(g.message) || String(galat);
  const kode = teks(g.code);

  const bagian = [pesan];
  const rinci = teks(g.details);
  if (rinci.length > 0) bagian.push(rinci);
  const saran = teks(g.hint);
  if (saran.length > 0) bagian.push(saran);
  if (kode.length > 0) {
    const petunjuk = PETUNJUK[kode];
    bagian.push(petunjuk ? `${petunjuk} (kode ${kode})` : `kode ${kode}`);
  }

  return bagian.join(" · ");
}
