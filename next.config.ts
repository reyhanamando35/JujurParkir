import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // surabaya.pmtiles berukuran 21 MB dan dibaca sepotong-sepotong lewat
        // HTTP Range. Tanpa aturan ini Next menyajikannya dengan max-age=0,
        // sehingga tiap geseran peta memicu permintaan ulang ke server.
        //
        // Sengaja BUKAN `immutable`: nama berkasnya tidak mengandung hash, jadi
        // kalau tile-nya diperbarui, peramban yang sudah menyimpannya tidak
        // akan pernah tahu. Satu hari lalu revalidasi lewat ETag sudah cukup
        // murah — jawabannya 304, bukan 21 MB.
        source: "/tiles/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
