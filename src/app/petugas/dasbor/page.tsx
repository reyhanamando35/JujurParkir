import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";

import { keluar } from "../actions";

export const metadata: Metadata = {
  title: "Dasbor Petugas",
};

// TODO: daftar laporan masuk + tindak lanjut

export default async function DasborPage() {
  // Pemeriksaan sesungguhnya ada di sini, bukan di layout: layout tidak
  // dirender ulang saat navigasi antar rute, jadi tidak bisa diandalkan
  // sebagai penjaga. Proxy hanya lapisan pertama.
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas");

  const dishub = petugas.peran === "dishub";

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
              Dasbor {dishub ? "Dishub" : "Koordinator Wilayah"}
            </h1>
            <p className="mt-2 text-pretty text-base leading-normal text-ink-muted">
              Masuk sebagai{" "}
              <span className="font-medium text-ink">{petugas.nama}</span> (
              {petugas.email})
            </p>
          </div>

          <form action={keluar}>
            <button
              type="submit"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] motion-reduce:transition-none"
            >
              Keluar
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold leading-tight text-ink">
            Cakupan kamu
          </h2>
          <p className="mt-1 text-pretty text-base leading-normal text-ink-muted">
            {dishub
              ? "Kamu bisa melihat dan menindaklanjuti laporan dari seluruh wilayah Kota Surabaya."
              : "Kamu hanya melihat laporan dari wilayah yang menjadi tanggung jawabmu. Batas ini ditegakkan di basis data, bukan hanya disembunyikan di tampilan."}
          </p>
        </div>

        <p className="mt-5 text-pretty text-sm leading-normal text-ink-muted">
          Daftar laporan belum dibangun.
        </p>
      </div>
    </main>
  );
}
