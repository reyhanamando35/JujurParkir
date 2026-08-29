"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Hanya tipe yang boleh ikut diekspor dari berkas "use server" selain
// fungsi async — tipe hilang saat kompilasi, jadi tidak melanggar aturan.
export type StatusMasuk = {
  pesan: string | null;
};

export async function masuk(
  _sebelumnya: StatusMasuk,
  formData: FormData,
): Promise<StatusMasuk> {
  const email = String(formData.get("email") ?? "").trim();
  const kataSandi = String(formData.get("kata_sandi") ?? "");

  if (!email || !kataSandi) {
    return { pesan: "Email dan kata sandi wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: kataSandi,
  });

  if (error) {
    // Pesannya sengaja tidak membedakan "email tidak terdaftar" dari
    // "kata sandi salah". Kalau dibedakan, form ini berubah jadi alat
    // untuk menebak email petugas mana yang punya akun.
    return { pesan: "Email atau kata sandi salah." };
  }

  // redirect() bekerja dengan melempar, jadi ia harus berada DI LUAR
  // blok try/catch mana pun — kalau tertangkap, navigasinya batal.
  redirect("/petugas/dasbor");
}

export async function keluar(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/petugas");
}
