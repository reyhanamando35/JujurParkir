import type { Metadata } from "next";
import Link from "next/link";

import { LABEL_STATUS_WARGA, adalahStatus } from "@/lib/laporan";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Status laporan",
};

type HasilCek = {
  status: string;
  tindak_lanjut: string | null;
  dibuat_pada: string;
  status_diubah_pada: string | null;
};

function tanggal(nilai: string | null): string {
  if (!nilai) return "—";
  return new Date(nilai).toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ kode: string }>;
}) {
  const { kode } = await params;
  const bersih = decodeURIComponent(kode).trim().toUpperCase();

  const supabase = await createClient();

  /**
   * Lewat fungsi, bukan query tabel.
   *
   * Tabel laporan tidak punya satu pun policy SELECT untuk anon — itu inti
   * model privasinya dan harus tetap begitu. cek_status_laporan adalah fungsi
   * security definer yang hanya mengembalikan empat kolom, tidak satu pun di
   * antaranya bisa dipakai menebak siapa pelapornya atau apa isi laporannya.
   */
  const { data, error } = await supabase.rpc("cek_status_laporan", {
    kode_cari: bersih,
  });

  if (error) {
    console.error("[cek-status] gagal memanggil fungsi:", error);
  }

  // Fungsi mengembalikan tabel, jadi hasilnya larik — kosong kalau kodenya
  // tidak ada. Tanpa tipe basis data yang di-generate, bentuknya ditegaskan
  // di sini terhadap kolom yang memang dideklarasikan fungsi di 0006.
  const hasil = (data as HasilCek[] | null)?.[0] ?? null;

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <p className="text-sm leading-normal text-ink-muted">Kode laporan</p>
        <h1 className="mt-1 text-2xl font-bold tracking-widest text-ink sm:text-3xl">
          {bersih}
        </h1>

        {error ? (
          <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
            <p className="text-pretty text-base leading-normal text-ink">
              Status tidak bisa diambil sekarang. Coba lagi sebentar lagi —
              kodemu tetap berlaku.
            </p>
          </div>
        ) : hasil === null ? (
          /*
            Jawabannya sengaja tidak membedakan "tidak pernah ada" dari
            "sudah dihapus": kalau dibedakan, halaman ini jadi alat untuk
            memastikan kode mana yang pernah dipakai.
          */
          <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
            <p className="text-base font-semibold leading-tight text-ink">
              Kode tidak ditemukan
            </p>
            <p className="mt-1 text-pretty text-base leading-normal text-ink-muted">
              Periksa lagi penulisannya. Kodenya 6 karakter, huruf besar semua,
              dan tidak pernah memakai angka 0 atau 1 — yang mirip itu huruf O
              dan I.
            </p>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-2xl border border-accent bg-surface p-5">
              <p className="text-sm leading-normal text-ink-muted">Status</p>
              <p className="mt-1 text-pretty text-lg font-semibold leading-tight text-ink">
                {adalahStatus(hasil.status)
                  ? LABEL_STATUS_WARGA[hasil.status]
                  : hasil.status}
              </p>
            </div>

            {hasil.tindak_lanjut && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-sm leading-normal text-ink-muted">
                  Keterangan petugas
                </p>
                <p className="mt-1 text-pretty text-base leading-relaxed text-ink">
                  {hasil.tindak_lanjut}
                </p>
              </div>
            )}

            <dl className="rounded-2xl border border-line bg-surface p-5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Dilaporkan</dt>
                <dd className="text-ink">{tanggal(hasil.dibuat_pada)}</dd>
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Terakhir diperbarui</dt>
                <dd className="text-ink">
                  {hasil.status_diubah_pada
                    ? tanggal(hasil.status_diubah_pada)
                    : "Belum ada perubahan"}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <p className="mt-5 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
          Laporan ini anonim. Kode di atas tidak terhubung ke nama, nomor, atau
          akun siapa pun — dan halaman ini tidak menampilkan isi laporan maupun
          lokasinya.
        </p>

        <p className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm leading-normal text-ink-muted">
          <Link
            href="/warga/cek"
            className="rounded-sm underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
          >
            Cek kode lain
          </Link>
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
