import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
 */
export async function proxy(request: NextRequest) {
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
  // Dibatasi ke /petugas saja. Proxy berjalan di setiap permintaan yang
  // cocok — termasuk prefetch — jadi tidak perlu ikut membebani halaman
  // warga yang justru harus cepat dan tanpa login.
  matcher: ["/petugas/:path*"],
};
