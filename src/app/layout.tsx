import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Satu keluarga variabel saja: satu berkas, satu permintaan, di-host sendiri
// oleh Next saat runtime (tidak ada panggilan ke Google dari browser pengguna).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Dipakai ulang oleh <title>/<meta description> dan blok Open Graph di bawah.
// Ditulis sekali supaya judul di tab dan judul di pratinjau tautan tidak bisa
// diam-diam berbeda isi.
const JUDUL = "JujurParkir · Tarif Parkir Resmi Kota Surabaya";
const DESKRIPSI =
  "Cek tarif resmi parkir tepi jalan umum Kota Surabaya dan laporkan pungutan yang tidak sesuai. Terbuka untuk siapa saja, tanpa perlu akun.";

export const metadata: Metadata = {
  title: {
    // Judul telanjang "JujurParkir" tidak memberi tahu apa pun ke orang yang
    // baru menerima tautannya; nama saja disimpan untuk template halaman anak.
    default: JUDUL,
    template: "%s · JujurParkir",
  },
  description: DESKRIPSI,
  // WhatsApp, X, dan Slack membaca tag og:* lebih dulu dan hanya jatuh ke
  // <title>/<meta description> kalau tag itu tidak ada — hasilnya sering
  // terpotong tidak rapi. Ditulis eksplisit supaya pratinjaunya pasti.
  openGraph: {
    title: JUDUL,
    description: DESKRIPSI,
    siteName: "JujurParkir",
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: JUDUL,
    description: DESKRIPSI,
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F7FC",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
