import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type PeranPetugas = "dishub" | "katar";

export type Petugas = {
  id: string;
  username: string;
  email: string;
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
  const { data } = await supabase
    .from("petugas")
    .select("id, username, email, nama, peran, wilayah_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return data as Petugas;
});
