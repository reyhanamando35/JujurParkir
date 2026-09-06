"use client";

import { useState } from "react";

import { keluar } from "./actions";

const kelasDasar =
  "rounded-xl border px-3 py-2 text-sm font-medium leading-normal transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] motion-reduce:transition-none";

/**
 * Keluar dengan konfirmasi dua langkah.
 *
 * Tombol keluar duduk bersebelahan dengan tautan yang sering dipakai, dan
 * salah tekan berarti sesi petugas hilang di tengah pekerjaan — verifikasi
 * laporan yang belum tersimpan ikut hilang bersamanya.
 *
 * Dua hal yang disengaja dan sebaiknya tidak diubah:
 *
 * 1. Bukan window.confirm(). Dialog bawaan peramban tidak bisa mengikuti token
 *    warna proyek, muncul di tempat yang tidak terduga, dan justru terbiasa
 *    ditekan buta oleh orang yang sering melihatnya.
 *
 * 2. "Batal" menempati posisi tombol "Keluar" semula, dan "Ya, keluar"
 *    digeser ke sebelahnya. Jadi ketukan kedua yang tidak sengaja — persis
 *    kejadian yang mau dicegah — mengenai Batal, bukan konfirmasi.
 */
export function TombolKeluar() {
  const [konfirmasi, setKonfirmasi] = useState(false);

  if (!konfirmasi) {
    return (
      <button
        type="button"
        onClick={() => setKonfirmasi(true)}
        className={`${kelasDasar} border-line bg-surface text-ink hover:border-accent hover:text-accent`}
      >
        Keluar
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Konfirmasi keluar"
      onKeyDown={(e) => {
        if (e.key === "Escape") setKonfirmasi(false);
      }}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-surface-2 px-2 py-1.5"
    >
      <span aria-live="polite" className="text-sm leading-normal text-ink">
        Keluar dari akun ini?
      </span>
      <button
        type="button"
        autoFocus
        onClick={() => setKonfirmasi(false)}
        className={`${kelasDasar} border-line bg-surface text-ink hover:border-accent hover:text-accent`}
      >
        Batal
      </button>
      <form action={keluar}>
        <button
          type="submit"
          className={`${kelasDasar} border-accent bg-accent text-accent-ink hover:bg-accent-strong`}
        >
          Ya, keluar
        </button>
      </form>
    </div>
  );
}
