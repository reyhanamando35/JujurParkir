import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";

import { FormMasuk } from "./form-masuk";

export const metadata: Metadata = {
  title: "Masuk Petugas",
};

const PESAN_ATUR_ULANG: Record<string, string> = {
  kedaluwarsa:
    "Tautan atur ulang kata sandinya sudah kedaluwarsa atau sudah dipakai. Coba masuk lagi, lalu minta tautan baru.",
  tanpa_kode:
    "Tautan atur ulang kata sandinya tidak lengkap. Buka tautannya langsung dari email, jangan disalin sebagian.",
};

export default async function PetugasPage({ searchParams }: PageProps<"/petugas">) {
  // Sudah masuk? Tidak perlu melihat form ini lagi.
  if (await getPetugas()) redirect("/petugas/dasbor");

  const { atur_ulang } = await searchParams;
  const pesanAturUlang =
    typeof atur_ulang === "string" ? PESAN_ATUR_ULANG[atur_ulang] : undefined;

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="size-5 shrink-0 text-accent"
          >
            <path d="M12 3 5.5 5.6v5.1c0 4 2.7 7.7 6.5 8.9 3.8-1.2 6.5-4.9 6.5-8.9V5.6L12 3Z" />
            <path d="m9.4 11.8 1.8 1.8 3.4-3.6" />
          </svg>
          <span className="text-lg font-extrabold tracking-tight text-ink">
            JujurParkir
          </span>
        </div>

        <h1 className="mt-6 text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Masuk sebagai petugas
        </h1>
        <p className="mt-2 max-w-[46ch] text-pretty text-base leading-normal text-ink-muted">
          Halaman ini untuk Dishub dan Kepala Pelataran (Katar). Peran
          kamu ditentukan otomatis dari akun, jadi tidak perlu dipilih di
          sini.
        </p>

        {pesanAturUlang && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-normal text-ink"
          >
            {pesanAturUlang}
          </p>
        )}

        <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <FormMasuk />
        </div>

        <p className="mt-5 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
          Warga tidak perlu masuk.{" "}
          <Link
            href="/warga"
            className="rounded-sm text-accent underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Cek tarif parkir di sini.
          </Link>
        </p>

        <p className="mt-4 text-sm leading-normal text-ink-muted">
          <Link
            href="/"
            className="rounded-sm underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Kembali ke halaman awal
          </Link>
        </p>
      </div>
    </main>
  );
}
