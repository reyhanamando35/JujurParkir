import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { VerifikasiLaporan, type BarisVerifikasi } from "./verifikasi-laporan";

export const metadata: Metadata = {
  title: "Verifikasi laporan",
};

type BarisView = {
  id: number;
  kode: string | null;
  jalur: string;
  titik_kode: string | null;
  bagian_kota: string | null;
  jenis: string;
  jenis_kendaraan: string | null;
  catatan: string | null;
  status: string;
  tindak_lanjut: string | null;
  waktu_kejadian: string | null;
  dibuat_pada: string;
  status_diubah_pada: string | null;
  ada_foto: boolean;
  lat: number | null;
  lng: number | null;
};

type FiturTitik = {
  id: string;
  properties: { alamat: string; lokasi: string; wilayah: string };
  geometry: { coordinates: [number, number] };
};

/**
 * Koordinat dan alamat titik resmi dibaca di SERVER, lalu ditempelkan ke tiap
 * laporan sebelum dikirim ke klien.
 *
 * Alternatifnya adalah mengirim seluruh berkas GeoJSON 1.235 titik ke peramban
 * petugas hanya untuk mencari beberapa alamat. Halaman warga memang melakukan
 * itu karena butuh menggambar semuanya; halaman ini tidak.
 */
async function petaTitik(): Promise<
  Map<string, { alamat: string; lokasi: string; lat: number; lng: number }>
> {
  const berkas = join(process.cwd(), "public", "data", "titik-parkir.geojson");
  const isi = JSON.parse(await readFile(berkas, "utf8")) as {
    features: FiturTitik[];
  };
  const peta = new Map<
    string,
    { alamat: string; lokasi: string; lat: number; lng: number }
  >();
  for (const f of isi.features) {
    peta.set(f.id, {
      alamat: f.properties.alamat,
      lokasi: f.properties.lokasi,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }
  return peta;
}

export default async function LaporanPage() {
  // Penjaga sesungguhnya ada di sini, bukan di layout maupun proxy — layout
  // tidak dirender ulang saat navigasi antar rute.
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas");

  const supabase = await createClient();

  // Cakupan wilayah TIDAK disaring di sini. View laporan_petugas dibuat
  // security_invoker = true, jadi policy "petugas baca laporan" yang menyaring:
  // Dishub sekota, Katar hanya wilayahnya. Menambahkan filter di sini akan
  // menyembunyikan kalau policy-nya suatu saat rusak.
  const { data, error } = await supabase
    .from("laporan_petugas")
    .select(
      "id, kode, jalur, titik_kode, bagian_kota, jenis, jenis_kendaraan, catatan, status, tindak_lanjut, waktu_kejadian, dibuat_pada, status_diubah_pada, ada_foto, lat, lng",
    )
    .order("dibuat_pada", { ascending: false })
    .limit(300)
    .returns<BarisView[]>();

  if (error) {
    console.error("[laporan] gagal memuat daftar:", error);
  }

  const titik = await petaTitik();

  const baris: BarisVerifikasi[] = (data ?? []).map((l) => {
    const t = l.titik_kode ? titik.get(l.titik_kode) : undefined;
    return {
      id: l.id,
      kode: l.kode,
      jalur: l.jalur,
      jenis: l.jenis,
      jenisKendaraan: l.jenis_kendaraan,
      catatan: l.catatan,
      status: l.status,
      tindakLanjut: l.tindak_lanjut,
      waktuKejadian: l.waktu_kejadian,
      dibuatPada: l.dibuat_pada,
      statusDiubahPada: l.status_diubah_pada,
      adaFoto: l.ada_foto,
      wilayah: l.bagian_kota,
      alamat: t?.alamat ?? null,
      lokasiTitik: t?.lokasi ?? null,
      // Jalur terdaftar memakai koordinat titik resmi; jalur luar daftar
      // memakai pin yang ditandai warga sendiri.
      lat: t?.lat ?? l.lat,
      lng: t?.lng ?? l.lng,
    };
  });

  const gagalMuat = Boolean(error);

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
              Verifikasi laporan
            </h1>
            <p className="mt-2 max-w-[70ch] text-pretty text-base leading-normal text-ink-muted">
              {petugas.peran === "dishub"
                ? "Seluruh laporan Kota Surabaya. Pilih dari peta atau cari di daftar."
                : "Laporan di wilayahmu saja. Pilih dari peta atau cari di daftar."}
            </p>
          </div>

          <Link
            href="/petugas/dasbor"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Ke dasbor
          </Link>
        </div>

        {gagalMuat && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-normal text-ink"
          >
            Daftar laporan gagal dimuat. Kalau ini terus terjadi, kemungkinan
            besar migrasi <code>0006_verifikasi_laporan.sql</code> belum
            dijalankan di Supabase.
          </p>
        )}

        <div className="mt-5">
          <VerifikasiLaporan baris={baris} />
        </div>
      </div>
    </main>
  );
}
