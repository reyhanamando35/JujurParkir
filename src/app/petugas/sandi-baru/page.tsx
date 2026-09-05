import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";

import { FormSandiBaru } from "./form-sandi-baru";

export const metadata: Metadata = {
  title: "Kata Sandi Baru",
};

export default async function SandiBaruPage() {
  // Halaman ini hanya bisa dibuka lewat tautan email yang sudah ditukar jadi
  // sesi oleh /petugas/atur-ulang. Tanpa sesi, tidak ada akun yang jelas mau
  // diubah kata sandinya.
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas?atur_ulang=kedaluwarsa");

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          Buat kata sandi baru
        </h1>
        <p className="mt-2 text-pretty text-base leading-normal text-ink-muted">
          Untuk akun{" "}
          <span className="font-medium text-ink">{petugas.email}</span>.
        </p>

        <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <FormSandiBaru />
        </div>
      </div>
    </main>
  );
}
