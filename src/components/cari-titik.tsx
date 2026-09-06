"use client";

import { useId, useMemo, useRef, useState } from "react";

/**
 * Pencarian titik parkir di atas peta.
 *
 * Seluruhnya berjalan di memori. Daftar 1.235 titik sudah ada di klien karena
 * peta memang memuatnya untuk digambar; mengirim tiap ketikan ke Supabase
 * berarti menunggu jaringan untuk data yang sudah ada di tangan, dan membuat
 * halaman yang seharusnya bisa dipakai tanpa internet jadi tidak bisa.
 *
 * Pencocokannya per-kata, bukan substring mentah terhadap seluruh baris.
 * Alasannya praktis: alamat di data ini ditulis "BALIWERTI 124 - 150", dan
 * orang mengetik "baliwerti 124". Substring mentah gagal di situ karena ada
 * " - " di tengahnya. Dengan memecah kueri jadi kata dan menuntut setiap kata
 * muncul di salah satu kata alamat, urutan dan jarak antar kata tidak lagi
 * jadi masalah.
 *
 * Tidak ada fuzzy match dan tidak ada pustaka tambahan. Untuk 1.235 baris,
 * penyaringan langsung selesai dalam hitungan milidetik pada tiap ketikan —
 * pustaka pencarian hanya akan menambah berkas yang harus diunduh warga.
 */

export type TitikCari = {
  id: string;
  alamat: string;
  lokasi: string;
  lat: number;
  lng: number;
};

/** Bentuk siap-cari: kata-katanya sudah dipecah sekali di muka. */
type Terindeks = TitikCari & { kata: string[]; alamatNormal: string };

const MIN_HURUF = 2;
const MAKS_SARAN = 8;

function normal(teks: string): string {
  return teks.toLowerCase().replace(/\s+/g, " ").trim();
}

export function CariTitik({
  daftar,
  onPilih,
  onKosongkan,
}: {
  daftar: TitikCari[];
  onPilih: (titik: TitikCari) => void;
  /** Dipanggil saat kotak dikosongkan — peta kembali ke tampilan seluruh kota. */
  onKosongkan: () => void;
}) {
  const [kueri, setKueri] = useState("");
  const [terbuka, setTerbuka] = useState(false);
  const [sorot, setSorot] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const idDaftar = useId();
  const idOpsi = (i: number) => `${idDaftar}-opsi-${i}`;

  /**
   * Indeks dibangun sekali per daftar, bukan tiap ketikan. Memecah 1.235
   * alamat jadi kata pada setiap huruf yang diketik adalah pekerjaan yang
   * sama berulang-ulang untuk hasil yang tidak pernah berubah.
   */
  const terindeks = useMemo<Terindeks[]>(
    () =>
      daftar.map((t) => {
        const alamatNormal = normal(t.alamat);
        return {
          ...t,
          alamatNormal,
          kata: `${alamatNormal} ${normal(t.lokasi)}`.split(" "),
        };
      }),
    [daftar],
  );

  const kueriNormal = normal(kueri);

  const hasil = useMemo<Terindeks[]>(() => {
    if (kueriNormal.length < MIN_HURUF) return [];
    const token = kueriNormal.split(" ").filter(Boolean);
    if (token.length === 0) return [];

    const cocok = terindeks.filter((t) =>
      token.every((k) => t.kata.some((w) => w.includes(k))),
    );

    // Yang alamatnya DIMULAI dengan apa yang diketik didahulukan. Orang yang
    // mengetik "baliwerti" hampir selalu mencari Jalan Baliwerti itu sendiri,
    // bukan titik lain yang kebetulan menyebutnya di nama lokasi.
    cocok.sort((a, b) => {
      const aAwal = a.alamatNormal.startsWith(kueriNormal) ? 0 : 1;
      const bAwal = b.alamatNormal.startsWith(kueriNormal) ? 0 : 1;
      if (aAwal !== bAwal) return aAwal - bAwal;
      return a.alamatNormal.localeCompare(b.alamatNormal, "id-ID");
    });

    return cocok.slice(0, MAKS_SARAN);
  }, [terindeks, kueriNormal]);

  const tampilkanDaftar = terbuka && kueriNormal.length >= MIN_HURUF;
  const adaHasil = hasil.length > 0;

  function pilih(titik: TitikCari) {
    onPilih(titik);
    setTerbuka(false);
    setSorot(-1);
  }

  function kosongkan() {
    setKueri("");
    setTerbuka(false);
    setSorot(-1);
    onKosongkan();
    inputRef.current?.focus();
  }

  function tekan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Tidak ikut menutup popup peta di belakangnya.
      e.stopPropagation();
      setTerbuka(false);
      setSorot(-1);
      return;
    }
    if (!tampilkanDaftar || !adaHasil) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSorot((s) => (s + 1) % hasil.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((s) => (s <= 0 ? hasil.length - 1 : s - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Tanpa sorot, Enter memilih saran teratas — itu yang diharapkan orang
      // yang mengetik lalu langsung menekan Enter tanpa menyentuh panah.
      pilih(hasil[sorot >= 0 ? sorot : 0]);
    }
  }

  /*
    Kolom lentur, bukan daftar melayang.

    Daftar sarannya SENGAJA tidak dipasang absolute di bawah kotak. Peta di
    /warga adalah flex-1 di antara header dan footer, jadi tingginya bergantung
    isi footer — di 375px ia bisa tinggal ~226px. Daftar melayang setinggi
    proporsi viewport akan menjulur keluar dari peta dan menutupi atribusi
    OpenStreetMap di sudut kiri-bawah, dan atribusi itu syarat lisensi yang
    tidak boleh tertutupi.

    Dengan kolom lentur di dalam wadah yang tingginya sudah dibatasi pemanggil
    (top-3 sampai bottom-12), daftarnya paling banyak setinggi ruang yang
    memang tersisa, lalu menggulir di dalam dirinya sendiri. Tidak ada
    perhitungan tinggi di JavaScript yang bisa meleset saat layar diputar.

    pointer-events dipasang per bagian: wadahnya tembus supaya peta di
    belakang ruang kosong tetap bisa digeser, hanya kotak dan daftarnya yang
    menerima sentuhan.
  */
  return (
    <div className="pointer-events-none flex min-h-0 flex-col">
      <label htmlFor={`${idDaftar}-input`} className="sr-only">
        Cari titik parkir berdasarkan nama jalan atau nama lokasi
      </label>

      <div className="pointer-events-auto relative shrink-0">
        <input
          ref={inputRef}
          id={`${idDaftar}-input`}
          type="text"
          value={kueri}
          onChange={(e) => {
            setKueri(e.target.value);
            setTerbuka(true);
            setSorot(-1);
          }}
          onFocus={() => setTerbuka(true)}
          onKeyDown={tekan}
          placeholder="Cari nama jalan atau lokasi"
          autoComplete="off"
          role="combobox"
          aria-expanded={tampilkanDaftar}
          aria-controls={idDaftar}
          aria-autocomplete="list"
          aria-activedescendant={
            tampilkanDaftar && sorot >= 0 ? idOpsi(sorot) : undefined
          }
          // pr-11 menyisakan ruang untuk tombol silang supaya teks panjang
          // tidak berjalan ke bawahnya.
          className="block w-full rounded-xl border border-line bg-surface py-3 pl-3 pr-11 text-base leading-normal text-ink shadow-sm placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
        />

        {kueri.length > 0 && (
          <button
            type="button"
            onClick={kosongkan}
            aria-label="Kosongkan pencarian dan tampilkan seluruh kota"
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
              className="size-5"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {/*
        Jumlah hasil diumumkan terpisah dari daftarnya. Pembaca layar tidak
        membacakan perubahan isi listbox dengan andal saat orang masih
        mengetik; kalimat pendek di sini yang menyampaikannya.
      */}
      <p className="sr-only" role="status">
        {tampilkanDaftar
          ? adaHasil
            ? `${hasil.length} titik ditemukan.`
            : "Tidak ada titik yang cocok."
          : ""}
      </p>

      {tampilkanDaftar && (
        <div className="mt-1 flex min-h-0 flex-1 flex-col">
          {adaHasil ? (
            <ul
              id={idDaftar}
              role="listbox"
              aria-label="Saran titik parkir"
              className="pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lg"
            >
              {hasil.map((t, i) => (
                <li
                  key={t.id}
                  id={idOpsi(i)}
                  role="option"
                  aria-selected={i === sorot}
                  // onMouseDown, bukan onClick: pointer yang turun di luar
                  // input akan melepas fokusnya lebih dulu dan menutup daftar,
                  // sehingga onClick tidak pernah sampai. preventDefault
                  // menahan perpindahan fokus itu.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pilih(t);
                  }}
                  onMouseEnter={() => setSorot(i)}
                  className={`flex min-h-11 cursor-pointer flex-col justify-center border-l-4 px-3 py-2 ${
                    i === sorot
                      ? "border-l-accent bg-accent text-accent-ink"
                      : "border-l-transparent bg-surface text-ink"
                  }`}
                >
                  <span className="text-base font-semibold leading-tight">
                    {t.alamat}
                  </span>
                  <span
                    className={`text-sm leading-normal ${
                      i === sorot ? "text-accent-ink/80" : "text-ink-muted"
                    }`}
                  >
                    {t.lokasi}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pointer-events-auto rounded-xl border border-line bg-surface px-3 py-3 text-sm leading-normal text-ink-muted shadow-lg">
              Tidak ditemukan. Coba nama jalan saja
            </p>
          )}
        </div>
      )}
    </div>
  );
}
