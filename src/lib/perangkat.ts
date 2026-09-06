import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Penanda perangkat untuk batas kirim laporan.
 *
 * Nilainya UUID acak, dibuat sekali saat orang pertama kali membuka /warga,
 * lalu disimpan di cookie httpOnly. Ia TIDAK diturunkan dari apa pun —
 * bukan dari IP, bukan dari user agent, bukan dari hasil sidik jari peramban.
 * Dua pengunjung dengan IP yang sama mendapat penanda berbeda; satu orang
 * yang berpindah jaringan tetap membawa penanda yang sama.
 *
 * Kenapa acak dan bukan turunan: penanda turunan bisa dihitung ulang oleh
 * siapa pun yang memegang data mentahnya, sehingga hitungan kiriman bisa
 * dipasangkan kembali ke orangnya. Penanda acak tidak bisa — ia tidak
 * mengandung informasi apa pun tentang pemiliknya, dan tabel kuota_kirim
 * sengaja tidak punya kolom yang menghubungkannya ke laporan mana pun
 * (lihat 0014_kuota_kirim.sql).
 *
 * Menghapus cookie berarti menjadi perangkat baru, dan itu memang batas dari
 * pendekatan ini. Tujuannya menahan banjir kiriman yang tidak disengaja atau
 * iseng sesaat, bukan menegakkan identitas — menegakkan identitas menuntut
 * akun, dan akun adalah persis hal yang tidak boleh ada di alur lapor warga.
 */

export const COOKIE_PERANGKAT = "jujurparkir_perangkat";

/** Setahun. Cookie yang berumur pendek hanya memindahkan batasnya, tidak menegakkannya. */
const UMUR_DETIK = 60 * 60 * 24 * 365;

/**
 * Rahasia penanda tangan.
 *
 * WAJIB diisi di lingkungan produksi. Tanpa ini, isi cookie tidak bisa
 * dibedakan dari yang dikarang sendiri oleh pengirim, dan batas kirimnya
 * dinonaktifkan — lihat baacaPerangkat di bawah dan komentar di
 * src/app/warga/actions.ts. Kegagalannya sengaja dibuat berisik di log dan
 * TIDAK menutup jalur lapor: warga yang tidak bisa melapor karena kesalahan
 * konfigurasi kita adalah kegagalan yang lebih buruk daripada batas yang
 * tidak berjalan.
 */
function rahasia(): string | null {
  const nilai = process.env.KUOTA_RAHASIA;
  return nilai && nilai.length >= 16 ? nilai : null;
}

function tandatangan(id: string, kunci: string): string {
  return createHmac("sha256", kunci).update(id).digest("base64url");
}

/** Bentuk cookie: "<uuid>.<hmac base64url>". */
export function buatNilaiCookie(): { id: string; nilai: string } | null {
  const kunci = rahasia();
  if (!kunci) return null;
  const id = randomUUID();
  return { id, nilai: `${id}.${tandatangan(id, kunci)}` };
}

/**
 * Membaca dan MEMVERIFIKASI cookie. Mengembalikan null kalau tanda tangannya
 * tidak cocok — jadi cookie yang disunting tangan diperlakukan sama seperti
 * tidak ada cookie sama sekali, bukan diterima sebagai perangkat baru pilihan
 * pengirim.
 */
export function bacaPerangkat(nilai: string | undefined): string | null {
  const kunci = rahasia();
  if (!kunci || !nilai) return null;

  const pemisah = nilai.lastIndexOf(".");
  if (pemisah <= 0) return null;

  const id = nilai.slice(0, pemisah);
  const tanda = nilai.slice(pemisah + 1);
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;

  // Dibandingkan dengan waktu tetap. Perbandingan string biasa berhenti di
  // karakter pertama yang berbeda, dan selisih waktunya bisa dipakai menebak
  // tanda tangan yang benar satu karakter demi satu karakter.
  const harusnya = Buffer.from(tandatangan(id, kunci));
  const diberikan = Buffer.from(tanda);
  if (harusnya.length !== diberikan.length) return null;
  if (!timingSafeEqual(harusnya, diberikan)) return null;

  return id;
}

export const OPSI_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: UMUR_DETIK,
  secure: process.env.NODE_ENV === "production",
} as const;

/** true kalau rahasianya belum dipasang — dipakai untuk memperingatkan di log. */
export function rahasiaBelumDipasang(): boolean {
  return rahasia() === null;
}
