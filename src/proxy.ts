import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  bacaPerangkat,
  buatNilaiCookie,
  COOKIE_PERANGKAT,
  OPSI_COOKIE,
} from "@/lib/perangkat";

/**
 * Di Next.js 16 berkas ini bernama `proxy`, bukan `middleware` lagi, dan
 * fungsinya wajib bernama `proxy`. Runtime-nya nodejs dan tidak bisa diubah.
 *
 * Dua tugasnya:
 *
 * 1. Menyegarkan token Supabase yang kedaluwarsa. Server Component tidak
 *    boleh menulis cookie (lihat blok try/catch kosong di
 *    src/lib/supabase/server.ts), jadi tanpa langkah ini sesi petugas
 *    akan mati sendiri begitu token habis masa berlakunya.
 *
 * 2. Pemeriksaan awal untuk /petugas/dasbor. Ini lapisan kenyamanan, BUKAN
 *    penjaga sesungguhnya — penjaganya ada di halaman lewat getPetugas(),
 *    ditambah RLS di basis data. Proxy saja tidak pernah cukup.
 *
 * 3. Memasang penanda perangkat di /warga untuk batas kirim laporan.
 *    Jalurnya keluar lebih awal dan TIDAK menyentuh Supabase sama sekali —
 *    lihat komentar di config di bawah.
 */
export async function proxy(request: NextRequest) {
  /*
    Jalur warga: keluar sebelum klien Supabase dibuat.

    Ini yang menjaga janji lama di config: halaman warga tidak boleh ikut
    membayar pemeriksaan sesi petugas. supabase.auth.getUser() di bawah adalah
    panggilan jaringan, dan menambahkannya ke tiap permintaan /warga — termasuk
    prefetch — akan memperlambat persis halaman yang paling harus cepat.

    Yang dikerjakan di sini hanya satu: kalau belum ada cookie perangkat yang
    sah, pasang satu. Cookie tidak bisa dipasang dari Server Component, dan
    memasangnya lewat Server Action akan membuat /warga jadi dinamis —
    padahal halaman itu sengaja dipertahankan statis supaya petanya tetap
    tergambar tanpa jaringan.
  */
  if (request.nextUrl.pathname.startsWith("/warga")) {
    const jawaban = NextResponse.next({ request });
    const adaSah = bacaPerangkat(
      request.cookies.get(COOKIE_PERANGKAT)?.value,
    );
    if (!adaSah) {
      const baru = buatNilaiCookie();
      // null berarti KUOTA_RAHASIA belum dipasang. Tidak ada cookie yang
      // dipasang, dan Server Action akan mencatatnya sebagai peringatan.
      if (baru) jawaban.cookies.set(COOKIE_PERANGKAT, baru.nilai, OPSI_COOKIE);
    }
    return jawaban;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/petugas/dasbor")) {
    return NextResponse.redirect(new URL("/petugas", request.url));
  }

  return response;
}

export const config = {
  // /warga ikut dicocokkan HANYA untuk memasang cookie perangkat, dan
  // jalurnya keluar di baris pertama proxy() sebelum klien Supabase dibuat.
  // Janji lamanya tetap berlaku: tidak ada pemeriksaan sesi petugas yang
  // membebani halaman warga.
  matcher: ["/petugas/:path*", "/warga/:path*"],
};
