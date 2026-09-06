"use client";

import { useActionState, useState } from "react";

import { LABEL_STATUS, STATUS_LAPORAN } from "@/lib/laporan";

import { ubahStatusLaporan, type StatusUbah } from "../laporan/actions";

const awal: StatusUbah = { pesan: null, berhasil: false };

/**
 * Pengubah status satu laporan, versi ringkas untuk baris tabel dasbor.
 *
 * Memakai Server Action yang sama persis dengan panel verifikasi di
 * /petugas/laporan — bukan action baru. Itu yang menjamin dua halaman tidak
 * bisa punya aturan berbeda tentang siapa boleh mengubah apa, dan yang
 * membuat pencatatan "siapa dan kapan" berlaku sama di keduanya: action itu
 * menulis ditangani_oleh dan status_diubah_pada dalam update yang sama, dan
 * hanya empat kolom itulah yang boleh disentuh peran authenticated (grant
 * kolom di 0006).
 *
 * Kolom tindak lanjut muncul hanya ketika statusnya menuntutnya. Server tetap
 * memeriksanya lagi — yang di sini cuma supaya petugas tahu sebelum menekan
 * simpan, bukan penjaganya.
 */
export function UbahStatus({
  id,
  status,
}: {
  id: number;
  status: string;
}) {
  const [hasil, aksi, menyimpan] = useActionState(ubahStatusLaporan, awal);
  const [pilihan, setPilihan] = useState(status);

  const wajibCatatan = pilihan === "selesai" || pilihan === "ditolak";
  const idPilih = `status-${id}`;
  const idCatatan = `tindak-${id}`;

  return (
    <form action={aksi} className="flex flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />

      <label htmlFor={idPilih} className="sr-only">
        Status laporan
      </label>
      <select
        id={idPilih}
        name="status"
        value={pilihan}
        onChange={(e) => setPilihan(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {STATUS_LAPORAN.map((s) => (
          <option key={s} value={s}>
            {LABEL_STATUS[s]}
          </option>
        ))}
      </select>

      {wajibCatatan && (
        <>
          <label htmlFor={idCatatan} className="sr-only">
            Tindak lanjut, dibaca warga saat mengecek kode laporannya
          </label>
          <input
            id={idCatatan}
            name="tindak_lanjut"
            type="text"
            maxLength={500}
            placeholder="Tindak lanjut (dibaca warga)"
            className="min-h-11 w-44 rounded-lg border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </>
      )}

      {pilihan !== status && (
        <button
          type="submit"
          disabled={menyimpan}
          className="min-h-11 rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-ink hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </button>
      )}

      {hasil.pesan && (
        <p
          role="status"
          className="max-w-44 text-pretty text-sm leading-normal text-ink"
        >
          {hasil.pesan}
        </p>
      )}
    </form>
  );
}
