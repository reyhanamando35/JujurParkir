import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Tempat mendarat tautan "atur ulang kata sandi" dari email.
 *
 * Harus berupa route handler, bukan halaman: menukar kode jadi sesi berarti
 * MENULIS cookie, dan Server Component tidak boleh menulis cookie (lihat
 * blok try/catch kosong di src/lib/supabase/server.ts). Setelah sesinya ada,
 * barulah pengguna dilempar ke formulir kata sandi baru.
 */
export async function GET(request: NextRequest) {
  const kode = request.nextUrl.searchParams.get("code");

  if (!kode) {
    return NextResponse.redirect(new URL("/petugas?atur_ulang=tanpa_kode", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(kode);

  if (error) {
    // Tautan atur ulang hanya sekali pakai dan punya masa berlaku. Yang
    // kedaluwarsa dikembalikan ke halaman masuk dengan penjelasan, bukan
    // dibiarkan mendarat di formulir yang pasti gagal saat disimpan.
    return NextResponse.redirect(new URL("/petugas?atur_ulang=kedaluwarsa", request.url));
  }

  return NextResponse.redirect(new URL("/petugas/sandi-baru", request.url));
}
