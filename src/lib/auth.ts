import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type PeranPetugas = "dishub" | "katar";

export type Petugas = {
  id: string;
  /**
   * Diambil dari akun Auth lewat getUser(), BUKAN dari kolom di tabel petugas.
   *
   * 0001_init.sql sempat menyalin email ke tabel petugas dengan alasan kunci
   * anon tidak boleh membaca skema auth. Alasan itu berlaku untuk membaca
   * email petugas LAIN — untuk petugas yang sedang masuk, getUser() sudah
   * mengembalikan emailnya. Menyalinnya berarti dua sumber kebenaran yang bisa
   * berbeda isi begitu email diganti lewat Supabase Auth.
   */
  email: string;
  nama: string;
  peran: PeranPetugas;
  wilayah_id: number | null;
};

/** Bentuk baris tabel petugas — sengaja tanpa email, lihat catatan di atas. */
type BarisPetugas = {
  id: string;
  nama: string;
  peran: PeranPetugas;
  wilayah_id: number | null;
};

/**
 * Satu-satunya pintu untuk mengetahui siapa petugas yang sedang masuk.
 *
 * Sengaja memakai `getUser()`, BUKAN `getSession()`: getSession hanya
 * membaca cookie apa adanya tanpa memverifikasi tanda tangan JWT-nya,
 * jadi isinya bisa dipalsukan dan tidak boleh dipakai untuk otorisasi.
 * getUser() memvalidasi token itu ke server Supabase.
 *
 * Dibungkus `cache()` supaya satu render hanya memanggilnya sekali
 * walau beberapa komponen bertanya.
 */
export const getPetugas = cache(async (): Promise<Petugas | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // RLS ("baca diri sendiri") sudah membatasi baris ke auth.uid(),
  // filter .eq() di sini hanya mempertegas maksudnya.
  //
  // Kolom yang diminta dijaga tetap sama dengan yang benar-benar ada di
  // tabel: satu nama kolom yang meleset membuat PostgREST menolak SELURUH
  // query, getPetugas() mengembalikan null, dan petugas yang kata sandinya
  // benar tetap terlempar balik ke halaman masuk tanpa pesan apa pun.
  const { data } = await supabase
    .from("petugas")
    .select("id, nama, peran, wilayah_id")
    .eq("id", user.id)
    .maybeSingle<BarisPetugas>();

  if (!data) return null;
  return { ...data, email: user.email ?? "" };
});
