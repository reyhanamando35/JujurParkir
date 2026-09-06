import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";
import { jelaskanGalat } from "@/lib/galat";
import { createClient } from "@/lib/supabase/server";
import type { KategoriRef } from "@/lib/tarif";

import { KelolaTitik, type BarisTitik } from "./kelola-titik";

export const metadata: Metadata = {
  title: "Kategori titik parkir",
};

/**
 * Berapa banyak titik yang ditampilkan sekali muat.
 *
 * Ada 1.235 titik dan tidak satu pun daftar penuhnya berguna: penetapan
 * dikerjakan per alamat yang sedang dicari, bukan dengan menggulir sampai
 * bawah. Batas ini dipasang di query, bukan di tampilan, supaya barisnya juga
 * tidak dikirim ke peramban.
 */
const BATAS = 50;

type Pencarian = { q?: string; saring?: string };

export default async function TitikPage({
  searchParams,
}: {
  searchParams: Promise<Pencarian>;
}) {
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas");

  // Sama seperti /petugas/tarif: kategori mengikuti Perda dan berlaku sekota,
  // jadi bukan wewenang Katar. Penjaga sesungguhnya ada di policy 0011.
  if (petugas.peran !== "dishub") redirect("/petugas/dasbor");

  const { q, saring } = await searchParams;
  const cari = (q ?? "").trim();
  const penyaring = saring === "sudah" || saring === "nonaktif" ? saring : "belum";

  const supabase = await createClient();

  let kueri = supabase
    .from("titik_parkir")
    .select("kode_titik, alamat, wilayah, kategori_tarif, sumber_kategori, progresif, nonaktif")
    .order("alamat")
    .limit(BATAS);

  // Tiga penyaring, dan yang bawaannya sengaja "belum ditetapkan": itulah
  // pekerjaan yang tersisa. Membuka halaman ini langsung menunjukkan apa yang
  // belum dikerjakan, bukan daftar 1.235 baris yang harus disaring sendiri.
  if (penyaring === "nonaktif") {
    kueri = kueri.eq("nonaktif", true);
  } else if (penyaring === "sudah") {
    kueri = kueri.eq("nonaktif", false).not("kategori_tarif", "is", null);
  } else {
    kueri = kueri.eq("nonaktif", false).is("kategori_tarif", null);
  }

  if (cari.length > 0) {
    // Koma dipakai PostgREST sebagai pemisah argumen `or`, jadi tanda koma di
    // dalam kata kunci harus dibuang sebelum dikirim — kalau tidak, kuerinya
    // pecah jadi filter yang tidak diminta siapa pun.
    const aman = cari.replaceAll(",", " ").replaceAll("%", " ");
    kueri = kueri.or(`alamat.ilike.%${aman}%,kode_titik.ilike.%${aman}%`);
  }

  const { data, error } = await kueri.returns<BarisTitik[]>();
  if (error) {
    console.error(`[titik] gagal membaca daftar: ${jelaskanGalat(error)}`);
  }

  const { data: kategori, error: galatKategori } = await supabase
    .from("kategori_tarif")
    .select("kode, nama")
    .order("urutan")
    .returns<KategoriRef[]>();

  if (galatKategori) {
    console.error(`[titik] gagal membaca kategori: ${jelaskanGalat(galatKategori)}`);
  }

  // Angka ringkas dihitung di basis data — `head: true` berarti tidak ada baris
  // yang ikut terkirim, hanya bilangannya. Jadi jumlah ini menyebut SELURUH
  // titik, bukan hanya 50 yang kebetulan tampil.
  const [total, sudah, usang] = await Promise.all([
    supabase
      .from("titik_parkir")
      .select("kode_titik", { count: "exact", head: true })
      .eq("nonaktif", false),
    supabase
      .from("titik_parkir")
      .select("kode_titik", { count: "exact", head: true })
      .eq("nonaktif", false)
      .not("kategori_tarif", "is", null),
    supabase
      .from("titik_parkir")
      .select("kode_titik", { count: "exact", head: true })
      .eq("nonaktif", true),
  ]);

  const jumlahTotal = total.count ?? 0;
  const jumlahSudah = sudah.count ?? 0;
  const jumlahNonaktif = usang.count ?? 0;

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
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

        <h1 className="mt-2 text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Kategori titik parkir
        </h1>
        <p className="mt-2 text-sm leading-normal text-ink-muted">
          {jumlahSudah.toLocaleString("id-ID")} dari{" "}
          {jumlahTotal.toLocaleString("id-ID")} titik sudah ditetapkan
          kategorinya. Titik yang belum ditetapkan tetap tampil di peta warga,
          tarifnya sebagai rentang.
        </p>

        {/*
          Baris usang hanya muncul kalau memang ada. Menyembunyikannya saat nol
          menjaga peringatan ini tetap berarti sesuatu ketika ia muncul.
        */}
        {jumlahNonaktif > 0 && (
          <p className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-normal text-ink">
            {jumlahNonaktif.toLocaleString("id-ID")} titik ditandai nonaktif —
            alamatnya berubah di data terbaru sehingga kodenya bergeser. Titik
            itu tidak lagi tampil di peta, tapi penetapannya masih tersimpan dan
            bisa dipindahkan ke kode yang baru.
          </p>
        )}

        <form method="get" className="mt-6 flex flex-wrap gap-2">
          <input type="hidden" name="saring" value={penyaring} />
          <input
            type="search"
            name="q"
            defaultValue={cari}
            placeholder="Cari alamat atau kode titik"
            aria-label="Cari alamat atau kode titik"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-base leading-normal text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Cari
          </button>
        </form>

        <nav aria-label="Saring titik" className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["belum", "Belum ditetapkan"],
              ["sudah", "Sudah ditetapkan"],
              ["nonaktif", "Nonaktif"],
            ] as const
          ).map(([nilai, label]) => {
            const aktif = penyaring === nilai;
            const tujuan = new URLSearchParams();
            tujuan.set("saring", nilai);
            if (cari.length > 0) tujuan.set("q", cari);
            return (
              <Link
                key={nilai}
                href={`/petugas/titik?${tujuan.toString()}`}
                aria-current={aktif ? "page" : undefined}
                className={
                  aktif
                    ? "rounded-xl border border-accent bg-accent px-3 py-2 text-sm font-medium leading-normal text-accent-ink"
                    : "rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <KelolaTitik
          baris={data ?? []}
          kategori={kategori ?? []}
          batas={BATAS}
          penyaring={penyaring}
        />
      </div>
    </main>
  );
}
