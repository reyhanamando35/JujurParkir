import type { Metadata } from "next";
import Link from "next/link";

import { PetaTarif } from "@/components/peta-tarif";

export const metadata: Metadata = {
  title: "Warga",
  description:
    "Peta tarif parkir tepi jalan umum Kota Surabaya. Terbuka tanpa perlu akun.",
};

export default function WargaPage() {
  return (
    <main className="flex h-viewport flex-col overflow-hidden">
      {/*
        Peta adalah canvas: pembaca layar tidak bisa menelusurinya, dan
        penjelajah keyboard akan terjebak di dalam kontrolnya. Tautan ini
        memberi jalan keluar sebelum mereka masuk.
      */}
      <a
        href="#keterangan-peta"
        className="sr-only rounded-xl bg-surface px-4 py-3 text-base font-medium text-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[1100] focus:ring-2 focus:ring-accent"
      >
        Lewati peta
      </a>

      <header className="shrink-0 border-b border-line bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl text-sm leading-normal text-ink-muted transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="size-4 shrink-0"
          >
            <path d="M19.5 12h-14" />
            <path d="m11 6.5-5.5 5.5 5.5 5.5" />
          </svg>
          Halaman awal
        </Link>
        <h1 className="mt-1 text-balance text-xl font-bold leading-tight tracking-tight text-ink">
          Peta tarif parkir
        </h1>
      </header>

      {/* Wadah berposisi: peta mengisinya penuh lewat absolute inset-0. */}
      <div className="relative min-h-0 flex-1">
        <PetaTarif />
      </div>

      {/*
        Keterangan tetap, sekaligus jalur setara bagi yang tidak bisa memakai
        peta. Diberi jarak yang cukup dari peta di atasnya: atribusi
        OpenStreetMap menempel di sudut kiri-bawah peta dan wajib terbaca utuh,
        jadi tidak boleh ada teks yang menempel atau menimpanya.
      */}
      <footer
        id="keterangan-peta"
        className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-6"
      >
        <p className="mx-auto max-w-3xl text-pretty text-sm leading-relaxed text-ink-muted">
          <span className="text-ink">1.235 titik parkir resmi</span> tepi jalan
          umum, dari data Dishub Kota Surabaya. Ketuk pin untuk melihat alamat
          dan jam jaganya.{" "}
          <span className="text-ink">Tarifnya belum diverifikasi</span> dan
          sengaja tidak ditampilkan — posisi pin pun sebagian masih perkiraan
          tengah ruas jalan.
        </p>
      </footer>
    </main>
  );
}
