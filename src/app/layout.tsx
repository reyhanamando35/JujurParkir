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

export const metadata: Metadata = {
  title: {
    default: "JujurParkir",
    template: "%s · JujurParkir",
  },
  description:
    "Cek tarif resmi parkir tepi jalan umum Kota Surabaya dan laporkan pungutan yang tidak sesuai. Terbuka untuk siapa saja, tanpa perlu akun.",
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
