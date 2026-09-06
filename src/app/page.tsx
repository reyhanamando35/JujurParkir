import Image from "next/image";
import Link from "next/link";

import { ParticleNetwork } from "@/components/particle-network";

/**
 * Kartu peran: satu <Link> membungkus seluruh area, latar solid (bukan kaca)
 * supaya animasi latar tidak pernah terlihat menembus teks.
 */
const cardClassName = [
  "group flex h-full flex-col rounded-2xl border border-line bg-surface p-5",
  "transition-[background-color,border-color,transform] duration-150 ease-out",
  "hover:border-accent hover:bg-surface-2",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  "active:scale-[0.99] motion-reduce:transition-none",
].join(" ");

const iconClassName =
  "size-6 shrink-0 text-ink-muted transition-colors duration-150 ease-out group-hover:text-accent motion-reduce:transition-none";

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={iconClassName}
    >
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <ParticleNetwork />

      {/*
        Lapisan peredam: gradien radial gelap dari tengah supaya tidak ada teks
        tipis yang duduk langsung di atas titik yang bergerak.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_35%,var(--damp-inner),var(--damp-outer))]"
      />

      <main className="relative z-10 flex flex-1 flex-col justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-2xl">
          {/* 1. Identitas */}
          <div className="flex items-center gap-2">
            {/*
              width/height 40 menyamai rasio asli logo (1024x1024) supaya Next
              memesan ruangnya sejak HTML pertama — tidak ada geseran tata letak
              saat gambar selesai dimuat. Tinggi tampilnya diatur CSS: 32px di
              mobile, 40px sejak breakpoint sm. `w-auto` wajib menemani `h-*`,
              kalau tidak next/image memperingatkan rasio yang diubah sebelah.
            */}
            <Image
              src="/logo-JujurParkir.png"
              alt="Logo JujurParkir"
              width={40}
              height={40}
              loading="eager"
              className="h-8 w-auto shrink-0 sm:h-10"
            />
            <span className="text-lg font-extrabold tracking-tight text-ink">
              JujurParkir
            </span>
          </div>
          <p className="mt-2 max-w-[46ch] text-pretty text-base leading-normal text-ink-muted">
            Tarif parkir tepi jalan umum Kota Surabaya, terbuka untuk siapa
            saja.
          </p>

          {/* 2. Judul pemilih peran */}
          <h1 className="mt-6 text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
            Kamu masuk sebagai siapa?
          </h1>

          {/* 3. Dua kartu peran */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Link href="/warga" className={cardClassName}>
              <div className="flex items-start justify-between gap-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                  className={iconClassName}
                >
                  <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z" />
                  <circle cx="12" cy="10.5" r="2.25" />
                </svg>
                <ArrowIcon />
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-tight text-ink">
                Warga
              </h2>
              <p className="mt-1 text-pretty text-base leading-normal text-ink-muted">
                Cek tarif resmi &amp; lapor tanpa perlu akun.
              </p>
            </Link>

            <Link href="/petugas" className={cardClassName}>
              <div className="flex items-start justify-between gap-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                  className={iconClassName}
                >
                  <path d="M12 3 5.5 5.6v5.1c0 4 2.7 7.7 6.5 8.9 3.8-1.2 6.5-4.9 6.5-8.9V5.6L12 3Z" />
                  <path d="m9.4 11.8 1.8 1.8 3.4-3.6" />
                </svg>
                <ArrowIcon />
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-tight text-ink">
                Petugas
              </h2>
              <p className="mt-1 text-pretty text-base leading-normal text-ink-muted">
                Masuk sebagai Dishub atau Kepala Pelataran (Katar).
              </p>
            </Link>
          </div>

          {/* 4. Catatan kaki — menjawab keraguan sebelum orang mengetuk */}
          <p className="mt-5 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
            Warga tidak perlu membuat akun. Masuk hanya diperlukan bagi petugas
            Dishub dan Kepala Pelataran.
          </p>

          {/*
            Pintu masuk cek status. Sebelumnya satu-satunya tautan ke sana ada
            di layar sukses tepat setelah mengirim laporan — begitu panel itu
            ditutup, pelapor tidak punya jalan kembali sama sekali. Padahal
            kode 6 karakter itu satu-satunya pegangannya, karena laporannya
            anonim dan tidak ada email untuk mengirim ulang.
          */}
          <p className="mt-3 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
            Sudah pernah melapor?{" "}
            <Link
              href="/warga/cek"
              className="rounded-sm text-accent underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
            >
              Cek status laporanmu dengan kode.
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
