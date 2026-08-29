import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Warga",
};

// TODO: peta tarif

export default function WargaPage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Warga
        </h1>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl text-base leading-normal text-ink-muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
        >
          Kembali ke halaman awal
        </Link>
      </div>
    </main>
  );
}
