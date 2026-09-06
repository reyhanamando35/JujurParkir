"use client";

import { useActionState, useState } from "react";

import {
  labelMode,
  rupiah,
  type BarisTarif,
  type KategoriRef,
} from "@/lib/tarif";

import { hapusTarif, simpanTarif, type StatusTarif } from "./actions";

const awal: StatusTarif = { pesan: null, berhasil: false };

/** null = tabel saja. "baru" = formulir kosong. BarisTarif = formulir terisi. */
type Formulir = null | "baru" | BarisTarif;

const kelasField = [
  "mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5",
  "text-base leading-normal text-ink placeholder:text-ink-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
].join(" ");

const kelasLabel = "text-sm font-medium leading-normal text-ink";

const kelasTombolUtama =
  "rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none";

const kelasTombolKedua =
  "rounded-xl border border-line bg-surface px-4 py-2.5 text-base font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none";

function nominal(nilai: number | null): string {
  // null berarti Perda tidak menetapkannya — berbeda dari nol, yang berarti
  // gratis. Ditulis berbeda supaya tidak tertukar saat dibaca sekilas.
  return nilai === null ? "—" : rupiah(nilai);
}

export function KelolaTarif({
  baris,
  kategori,
}: {
  baris: BarisTarif[];
  kategori: KategoriRef[];
}) {
  const [formulir, setFormulir] = useState<Formulir>(null);
  const [status, simpanAction, menyimpan] = useActionState(simpanTarif, awal);
  const [statusHapus, hapusAction] = useActionState(hapusTarif, awal);

  const namaKategori = new Map(kategori.map((k) => [k.kode, k.nama]));
  const sedangUbah = formulir !== null && formulir !== "baru";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight text-ink">
          Tarif yang ditetapkan
        </h2>
        {formulir === null && (
          <button
            type="button"
            onClick={() => setFormulir("baru")}
            className={kelasTombolUtama}
          >
            Tambah tarif
          </button>
        )}
      </div>

      {statusHapus.pesan && formulir === null && (
        <p role="status" className="mt-2 text-sm leading-normal text-ink">
          {statusHapus.pesan}
        </p>
      )}

      {baris.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-10 text-center">
          <p className="text-base font-semibold leading-tight text-ink">
            Belum ada tarif yang ditetapkan
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
            Selama kosong, peta warga tidak menampilkan angka tarif apa pun —
            hanya keterangan bahwa tarif resminya belum diverifikasi.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Kategori</th>
                  <th className="px-4 py-2 font-medium">Kendaraan</th>
                  <th className="px-4 py-2 font-medium">Mode</th>
                  <th className="px-4 py-2 font-medium">Awal</th>
                  <th className="px-4 py-2 font-medium">Per jam</th>
                  <th className="px-4 py-2 font-medium">Maks</th>
                  <th className="px-4 py-2 font-medium">Sumber</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink">
                      {namaKategori.get(b.kategori) ?? b.kategori}
                    </td>
                    <td className="px-4 py-2 capitalize text-ink">
                      {b.jenis_kendaraan}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {labelMode(b.mode)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink">
                      {nominal(b.tarif_awal)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink">
                      {nominal(b.tarif_per_jam)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink">
                      {nominal(b.tarif_maks)}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{b.sumber}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setFormulir(b)}
                        className="rounded-lg text-sm font-medium text-ink underline underline-offset-4 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        Ubah
                      </button>
                      <form action={hapusAction} className="ml-3 inline">
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-lg text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Hapus
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formulir !== null && (
        <form
          action={simpanAction}
          // key memaksa React memasang ulang input-nya saat berpindah baris,
          // supaya defaultValue baris sebelumnya tidak tertinggal di layar.
          key={sedangUbah ? formulir.id : "baru"}
          className="mt-6 rounded-2xl border border-line bg-surface p-5"
        >
          <h2 className="text-lg font-semibold leading-tight text-ink">
            {sedangUbah ? "Ubah tarif" : "Tambah tarif"}
          </h2>
          <p className="mt-1 text-pretty text-sm leading-normal text-ink-muted">
            Kombinasi kategori, kendaraan, dan mode hanya boleh ada satu.
          </p>

          {sedangUbah && (
            <input type="hidden" name="id" value={formulir.id} />
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="kategori" className={kelasLabel}>
                Kategori
              </label>
              <select
                id="kategori"
                name="kategori"
                required
                defaultValue={sedangUbah ? formulir.kategori : ""}
                className={kelasField}
              >
                <option value="" disabled>
                  Pilih kategori
                </option>
                {kategori.map((k) => (
                  <option key={k.kode} value={k.kode}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="jenis_kendaraan" className={kelasLabel}>
                Kendaraan
              </label>
              <select
                id="jenis_kendaraan"
                name="jenis_kendaraan"
                required
                defaultValue={sedangUbah ? formulir.jenis_kendaraan : "motor"}
                className={kelasField}
              >
                <option value="motor">Motor</option>
                <option value="mobil">Mobil</option>
              </select>
            </div>

            <div>
              <label htmlFor="mode" className={kelasLabel}>
                Mode
              </label>
              <select
                id="mode"
                name="mode"
                required
                defaultValue={sedangUbah ? formulir.mode : "non_progresif"}
                className={kelasField}
              >
                <option value="non_progresif">Sekali bayar</option>
                <option value="progresif">Progresif</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="tarif_awal" className={kelasLabel}>
                Tarif awal <span className="text-ink-muted">(Rp)</span>
              </label>
              <input
                id="tarif_awal"
                name="tarif_awal"
                type="text"
                inputMode="numeric"
                defaultValue={sedangUbah ? (formulir.tarif_awal ?? "") : ""}
                placeholder="1000"
                className={kelasField}
              />
            </div>

            <div>
              <label htmlFor="tarif_per_jam" className={kelasLabel}>
                Per jam <span className="text-ink-muted">(Rp)</span>
              </label>
              <input
                id="tarif_per_jam"
                name="tarif_per_jam"
                type="text"
                inputMode="numeric"
                defaultValue={sedangUbah ? (formulir.tarif_per_jam ?? "") : ""}
                placeholder="Kosongkan bila sekali bayar"
                className={kelasField}
              />
            </div>

            <div>
              <label htmlFor="tarif_maks" className={kelasLabel}>
                Maksimum <span className="text-ink-muted">(Rp)</span>
              </label>
              <input
                id="tarif_maks"
                name="tarif_maks"
                type="text"
                inputMode="numeric"
                defaultValue={sedangUbah ? (formulir.tarif_maks ?? "") : ""}
                placeholder="Kosongkan bila tidak dibatasi"
                className={kelasField}
              />
            </div>
          </div>

          <p className="mt-2 text-pretty text-sm leading-normal text-ink-muted">
            Kolom yang dikosongkan disimpan sebagai &ldquo;tidak
            ditetapkan&rdquo;, bukan nol. Nol berarti gratis, dan itu pernyataan
            yang berbeda.
          </p>

          <div className="mt-4">
            <label htmlFor="sumber" className={kelasLabel}>
              Sumber <span className="text-ink-muted">(wajib)</span>
            </label>
            <input
              id="sumber"
              name="sumber"
              type="text"
              required
              maxLength={200}
              defaultValue={sedangUbah ? formulir.sumber : ""}
              placeholder="Contoh: Perda 7/2023 Lampiran I huruf C"
              className={kelasField}
            />
          </div>

          <p
            role="alert"
            aria-live="polite"
            className="mt-3 min-h-5 text-sm leading-normal text-ink"
          >
            {status.pesan}
          </p>

          <div className="mt-1 flex flex-wrap gap-2">
            <button type="submit" disabled={menyimpan} className={kelasTombolUtama}>
              {menyimpan
                ? "Menyimpan…"
                : sedangUbah
                  ? "Simpan perubahan"
                  : "Tambah tarif"}
            </button>
            <button
              type="button"
              onClick={() => setFormulir(null)}
              className={kelasTombolKedua}
            >
              {status.berhasil ? "Selesai" : "Batal"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
