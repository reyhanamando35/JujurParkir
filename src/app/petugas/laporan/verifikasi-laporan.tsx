"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { PetaLaporan, type PenandaLaporan } from "@/components/peta-laporan";
import {
  LABEL_STATUS,
  STATUS_LAPORAN,
  labelJalur,
  labelJenis,
  type StatusLaporan,
} from "@/lib/laporan";

import { ubahStatusLaporan, type StatusUbah } from "./actions";

export type BarisVerifikasi = {
  id: number;
  kode: string | null;
  jalur: string;
  jenis: string;
  jenisKendaraan: string | null;
  catatan: string | null;
  status: string;
  tindakLanjut: string | null;
  waktuKejadian: string | null;
  dibuatPada: string;
  statusDiubahPada: string | null;
  adaFoto: boolean;
  wilayah: string | null;
  alamat: string | null;
  lokasiTitik: string | null;
  lat: number | null;
  lng: number | null;
};

const awal: StatusUbah = { pesan: null, berhasil: false };

const SARINGAN = ["semua", ...STATUS_LAPORAN] as const;

function tanggal(nilai: string | null): string {
  if (!nilai) return "—";
  return new Date(nilai).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function namaLokasi(b: BarisVerifikasi): string {
  if (b.alamat) return b.alamat;
  if (b.lat !== null && b.lng !== null) {
    return `Koordinat ${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}`;
  }
  return "Lokasi tidak tercatat";
}

export function VerifikasiLaporan({ baris }: { baris: BarisVerifikasi[] }) {
  const [cari, setCari] = useState("");
  const [saringan, setSaringan] = useState<(typeof SARINGAN)[number]>("semua");
  const [terpilih, setTerpilih] = useState<number | null>(null);

  const tersaring = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    return baris.filter((b) => {
      if (saringan !== "semua" && b.status !== saringan) return false;
      if (kunci.length === 0) return true;
      // Dicocokkan ke semua yang mungkin diingat petugas: kode yang disebutkan
      // warga lewat telepon, nama jalan, jenis keluhan, dan wilayah.
      return [
        b.kode ?? "",
        b.alamat ?? "",
        b.lokasiTitik ?? "",
        b.wilayah ?? "",
        labelJenis(b.jenis),
      ]
        .join(" ")
        .toLowerCase()
        .includes(kunci);
    });
  }, [baris, cari, saringan]);

  const penanda: PenandaLaporan[] = useMemo(
    () =>
      tersaring
        .filter((b): b is BarisVerifikasi & { lat: number; lng: number } =>
          b.lat !== null && b.lng !== null,
        )
        .map((b) => ({
          id: b.id,
          lat: b.lat,
          lng: b.lng,
          status: b.status,
          ringkas: `${labelJenis(b.jenis)} — ${namaLokasi(b)} (${
            LABEL_STATUS[b.status as StatusLaporan] ?? b.status
          })`,
        })),
    [tersaring],
  );

  const dipilih = baris.find((b) => b.id === terpilih) ?? null;
  const tanpaKoordinat = tersaring.length - penanda.length;

  return (
    <div className="flex flex-col gap-5">
      <PetaLaporan
        penanda={penanda}
        terpilih={terpilih}
        onPilih={setTerpilih}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="cari-laporan"
            className="text-sm font-medium leading-normal text-ink"
          >
            Cari laporan
          </label>
          <input
            id="cari-laporan"
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Kode laporan, nama jalan, atau jenis keluhan"
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base leading-normal text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>

        <div>
          <span className="text-sm font-medium leading-normal text-ink">
            Status
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SARINGAN.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSaringan(s)}
                aria-pressed={saringan === s}
                className={`rounded-lg border px-2.5 py-1.5 text-sm leading-normal transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none ${
                  saringan === s
                    ? "border-accent bg-accent text-accent-ink font-semibold"
                    : "border-line bg-surface text-ink hover:border-accent"
                }`}
              >
                {s === "semua" ? "Semua" : LABEL_STATUS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm leading-normal text-ink-muted">
        {tersaring.length} laporan ditampilkan
        {tanpaKoordinat > 0 &&
          `, ${tanpaKoordinat} di antaranya tidak punya koordinat sehingga tidak muncul di peta`}
        .
      </p>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {tersaring.length === 0 ? (
          <p className="px-4 py-10 text-center text-base leading-normal text-ink-muted">
            Tidak ada laporan yang cocok.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {tersaring.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setTerpilih(b.id)}
                  aria-current={terpilih === b.id}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none ${
                    terpilih === b.id ? "bg-surface-2" : ""
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium leading-tight text-ink">
                      {labelJenis(b.jenis)}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-sm leading-normal text-ink-muted">
                      {LABEL_STATUS[b.status as StatusLaporan] ?? b.status}
                    </span>
                  </span>
                  <span className="text-sm leading-normal text-ink-muted">
                    {namaLokasi(b)} · {labelJalur(b.jalur)} ·{" "}
                    {tanggal(b.dibuatPada)}
                    {b.kode ? ` · ${b.kode}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dipilih && (
        <PanelVerifikasi
          key={dipilih.id}
          baris={dipilih}
          onTutup={() => setTerpilih(null)}
        />
      )}
    </div>
  );
}

function PanelVerifikasi({
  baris,
  onTutup,
}: {
  baris: BarisVerifikasi;
  onTutup: () => void;
}) {
  const [status, formAction, menunggu] = useActionState(
    ubahStatusLaporan,
    awal,
  );
  const [pilihan, setPilihan] = useState<string>(baris.status);
  const [tindakLanjut, setTindakLanjut] = useState(baris.tindakLanjut ?? "");
  const wadahRef = useRef<HTMLDivElement | null>(null);

  // Panel muncul di bawah daftar yang panjang; tanpa ini petugas mengetuk baris
  // lalu tidak melihat apa-apa berubah di layar.
  useEffect(() => {
    wadahRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const wajibTindakLanjut = pilihan === "selesai" || pilihan === "ditolak";

  return (
    <div
      ref={wadahRef}
      className="rounded-2xl border border-accent bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold leading-tight text-ink">
          {labelJenis(baris.jenis)}
        </h2>
        <button
          type="button"
          onClick={onTutup}
          className="rounded-lg px-2 py-1 text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Tutup
        </button>
      </div>

      {/*
        Keterangan warga sengaja ditampilkan. Petugas tidak bisa memutuskan
        sebuah laporan selesai atau tidak terbukti tanpa membacanya — dan
        tabel ini memang tidak pernah menyimpan nama, kontak, atau akun
        siapa pun, jadi yang terbaca di sini bukan identitas.
      */}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Lokasi</dt>
        <dd className="text-ink">
          {namaLokasi(baris)}
          {baris.lokasiTitik ? ` (${baris.lokasiTitik})` : ""}
        </dd>

        <dt className="text-ink-muted">Jalur</dt>
        <dd className="text-ink">
          {labelJalur(baris.jalur)}
          {baris.wilayah ? ` · Surabaya ${baris.wilayah}` : ""}
        </dd>

        <dt className="text-ink-muted">Waktu kejadian</dt>
        <dd className="text-ink">{tanggal(baris.waktuKejadian)}</dd>

        <dt className="text-ink-muted">Dilaporkan</dt>
        <dd className="text-ink">{tanggal(baris.dibuatPada)}</dd>

        <dt className="text-ink-muted">Kendaraan</dt>
        <dd className="text-ink">{baris.jenisKendaraan ?? "—"}</dd>

        <dt className="text-ink-muted">Kode laporan</dt>
        <dd className="font-medium tabular-nums tracking-wider text-ink">
          {baris.kode ?? "—"}
        </dd>
      </dl>

      <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-sm font-medium leading-normal text-ink">
          Keterangan warga
        </p>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-ink">
          {baris.catatan ?? "(tidak diisi)"}
        </p>
        {baris.adaFoto && (
          <p className="mt-2 text-sm leading-normal text-ink-muted">
            Laporan ini menyertakan foto. Tampilan foto belum tersedia di
            halaman ini.
          </p>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="id" value={baris.id} />

        {/*
          Status dikirim lewat input tersembunyi yang nilainya datang dari state
          React, BUKAN dari radio di bawah.

          Alasannya bukan gaya-gayaan: React mereset DOM form setelah sebuah
          Server Action selesai, dan radio terkendali tidak selalu ikut
          disinkronkan ulang sesudahnya. Akibatnya pernah terjadi — petugas
          memilih "Selesai ditangani", menyimpan, lalu menyimpan sekali lagi,
          dan yang tertulis ke basis data justru "baru" tanpa satu pun pesan
          galat. Nilai yang dikirim harus berasal dari sumber yang sama dengan
          yang dilihat petugas di layar.
        */}
        <input type="hidden" name="status" value={pilihan} />

        <fieldset>
          <legend className="text-sm font-medium leading-normal text-ink">
            Status
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {STATUS_LAPORAN.map((s) => (
              <label
                key={s}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3"
              >
                <input
                  type="radio"
                  // Sengaja BUKAN "status": radio ini murni kendali tampilan,
                  // yang terkirim adalah input tersembunyi di atas.
                  name="pilih_status"
                  value={s}
                  checked={pilihan === s}
                  onChange={() => setPilihan(s)}
                  className="size-4 shrink-0 accent-accent"
                />
                <span className="text-base leading-normal text-ink">
                  {LABEL_STATUS[s]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="tindak_lanjut"
            className="text-sm font-medium leading-normal text-ink"
          >
            Tindak lanjut{" "}
            {wajibTindakLanjut ? (
              <span className="text-accent">(wajib)</span>
            ) : (
              <span className="text-ink-muted">(opsional)</span>
            )}
          </label>
          {/*
            Terkendali, bukan defaultValue, dengan alasan yang sama seperti
            input status di atas: form direset setelah action selesai. Dengan
            defaultValue, tindak lanjut yang sudah panjang diketik akan hilang
            begitu penyimpanannya ditolak — persis saat petugas paling tidak
            mau mengetik ulang.
          */}
          <textarea
            id="tindak_lanjut"
            name="tindak_lanjut"
            rows={3}
            maxLength={500}
            value={tindakLanjut}
            onChange={(e) => setTindakLanjut(e.target.value)}
            placeholder="Contoh: sudah dicek ke lokasi, juru parkirnya diberi teguran dan papan tarif dipasang ulang."
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base leading-normal text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
          <p className="mt-1 text-pretty text-sm leading-normal text-ink-muted">
            <span className="font-medium text-ink">
              Teks ini dibaca warga
            </span>{" "}
            saat mengecek kode laporannya, jadi jangan tulis nama, nomor, atau
            catatan internal. Maksimal 500 karakter.
          </p>
        </div>

        <p
          role="alert"
          aria-live="polite"
          className="min-h-5 text-sm leading-normal text-ink"
        >
          {status.pesan}
        </p>

        <button
          type="submit"
          disabled={menunggu}
          className="rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
        >
          {menunggu ? "Menyimpan…" : "Simpan tindak lanjut"}
        </button>
      </form>
    </div>
  );
}
