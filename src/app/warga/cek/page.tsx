import type { Metadata } from "next";
import Link from "next/link";

import { FormCek } from "./form-cek";

export const metadata: Metadata = {
  title: "Cek status laporan",
};

export default function CekPage() {
  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Cek status laporan
        </h1>
        <p className="mt-2 max-w-[46ch] text-pretty text-base leading-normal text-ink-muted">
          Masukkan kode 6 karakter yang kamu terima setelah mengirim laporan.
          Tidak perlu akun — kode itu sendiri yang membuka statusnya.
        </p>

        <FormCek />

        <p className="mt-8 text-sm leading-normal text-ink-muted">
          <Link
            href="/warga"
            className="rounded-sm underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Kembali ke peta tarif
          </Link>
        </p>
      </div>
    </main>
  );
}
