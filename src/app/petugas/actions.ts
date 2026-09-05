"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Hanya tipe yang boleh ikut diekspor dari berkas "use server" selain
// fungsi async — tipe hilang saat kompilasi, jadi tidak melanggar aturan.
export type StatusMasuk = {
  pesan: string | null;
  /**
   * Berapa kali kata sandi ditolak berturut-turut.
   *
   * Dihitung di server dan dibawa lewat state useActionState, bukan disimpan
   * di komponen: nilai yang hidup di klien ikut hilang setiap kali React
   * merender ulang form setelah submit, dan hitungannya jadi selalu 1.
   */
  gagal: number;
};

export async function masuk(
  sebelumnya: StatusMasuk,
  formData: FormData,
): Promise<StatusMasuk> {
  const email = String(formData.get("email") ?? "").trim();
  const kataSandi = String(formData.get("kata_sandi") ?? "");

  if (!email || !kataSandi) {
    // Kolom kosong bukan percobaan kata sandi, jadi tidak ikut dihitung.
    return { pesan: "Email dan kata sandi wajib diisi.", gagal: sebelumnya.gagal };
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
    return { pesan: "Email atau kata sandi salah.", gagal: sebelumnya.gagal + 1 };
  }

  // redirect() bekerja dengan melempar, jadi ia harus berada DI LUAR
  // blok try/catch mana pun — kalau tertangkap, navigasinya batal.
  redirect("/petugas/dasbor");
}

export type StatusAturUlang = {
  pesan: string | null;
  terkirim: boolean;
};

export async function kirimTautanAturUlang(
  _sebelumnya: StatusAturUlang,
  formData: FormData,
): Promise<StatusAturUlang> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { pesan: "Isi dulu email dinas kamu di atas.", terkirim: false };
  }

  const daftarKepala = await headers();
  const host = daftarKepala.get("host") ?? "localhost:3000";
  const protokol = host.startsWith("localhost") ? "http" : "https";

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${protokol}://${host}/petugas/atur-ulang`,
  });

  // Jawabannya sengaja sama baik emailnya terdaftar maupun tidak, dengan
  // alasan yang sama seperti pesan galat masuk di atas: kalau dibedakan,
  // tombol ini jadi alat untuk memastikan email mana yang punya akun.
  return {
    pesan:
      "Kalau email itu terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim ke sana.",
    terkirim: true,
  };
}

export async function simpanKataSandiBaru(
  _sebelumnya: { pesan: string | null },
  formData: FormData,
): Promise<{ pesan: string | null }> {
  const kataSandi = String(formData.get("kata_sandi") ?? "");
  const ulangi = String(formData.get("ulangi") ?? "");

  if (kataSandi.length < 8) {
    return { pesan: "Kata sandi baru minimal 8 karakter." };
  }
  if (kataSandi !== ulangi) {
    return { pesan: "Dua kolom kata sandi belum sama." };
  }

  const supabase = await createClient();

  // Tautan dari email sudah ditukar jadi sesi oleh route handler
  // /petugas/atur-ulang; tanpa sesi itu, updateUser tidak tahu akun mana yang
  // dimaksud dan permintaannya harus ditolak, bukan diteruskan.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      pesan: "Tautannya sudah kedaluwarsa. Minta tautan baru dari halaman masuk.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: kataSandi });
  if (error) {
    return { pesan: "Kata sandi gagal disimpan. Coba lagi." };
  }

  redirect("/petugas/dasbor");
}

export async function keluar(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/petugas");
}
