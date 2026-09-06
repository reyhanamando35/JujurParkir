import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";
import { jelaskanGalat } from "@/lib/galat";
import { createClient } from "@/lib/supabase/server";
import type { BarisTarif, KategoriRef } from "@/lib/tarif";

import { TombolKeluar } from "../tombol-keluar";
import { KelolaTarif } from "./kelola-tarif";

export const metadata: Metadata = {
  title: "Tarif rujukan",
};

export default async function TarifPage() {
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas");

  // Katar tidak boleh menetapkan tarif — berlakunya sekota, bukan per wilayah.
  // Penjaga sesungguhnya ada di policy basis data; ini supaya halamannya tidak
  // terbuka sia-sia lalu setiap simpanan ditolak.
  if (petugas.peran !== "dishub") redirect("/petugas/dasbor");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarif")
    .select(
      "id, kategori, jenis_kendaraan, mode, tarif_awal, tarif_per_jam, tarif_maks, sumber",
    )
    .order("kategori")
    .order("jenis_kendaraan")
    .returns<BarisTarif[]>();

  if (error) {
    console.error(`[tarif] gagal membaca daftar: ${jelaskanGalat(error)}`);
  }

  // Kosakata kategori dibaca dari tabel referensi, bukan dari konstanta di
  // kode. Formulir hanya boleh menawarkan nilai yang benar-benar diterima
  // foreign key.
  const { data: kategori, error: galatKategori } = await supabase
    .from("kategori_tarif")
    .select("kode, nama")
    .order("urutan")
    .returns<KategoriRef[]>();

  if (galatKategori) {
    console.error(
      `[tarif] gagal membaca kategori: ${jelaskanGalat(galatKategori)}`,
    );
  }

  // Salah satunya gagal sudah cukup: tabel tanpa kosakata kategori merender
  // kode mentah, dan kategori tanpa tabel merender keadaan kosong yang keliru.
  const gagalMuat = Boolean(error || galatKategori);

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/petugas/dasbor"
            className="inline-flex items-center gap-1.5 rounded-xl text-sm leading-normal text-ink-muted transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
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
            Dasbor
          </Link>
          {/* Konfirmasi dua langkah — lihat alasannya di komponennya. */}
          <TombolKeluar />
        </div>

        <h1 className="mt-2 text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Tarif rujukan
        </h1>

        {/*
          Tanpa baris ini, kueri yang gagal jatuh ke `data ?? []` dan tabelnya
          merender keadaan kosong yang berbunyi "Belum ada tarif yang
          ditetapkan" — kalimat tenang yang keliru. Petugas membacanya sebagai
          "belum diisi", lalu mengisi ulang tarif yang sebenarnya sudah ada.
          `console.error` di atas tidak menolong siapa pun yang tidak sedang
          membuka DevTools.
        */}
        {gagalMuat && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-normal text-ink"
          >
            Daftar tarif gagal dimuat — ini bukan berarti tabelnya kosong.
            Alasan lengkapnya tercetak di log server.
          </p>
        )}

        <KelolaTarif
          baris={data ?? []}
          kategori={kategori ?? []}
          gagalMuat={gagalMuat}
        />
      </div>
    </main>
  );
}
