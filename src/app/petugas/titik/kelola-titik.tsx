"use client";

import { useActionState, useState } from "react";

import { LABEL_SUMBER_KATEGORI, type KategoriRef } from "@/lib/tarif";

import { simpanAtributTitik, type StatusTitik } from "./actions";

export type BarisTitik = {
  kode_titik: string;
  alamat: string;
  wilayah: string | null;
  kategori_tarif: string | null;
  sumber_kategori: string | null;
  progresif: boolean | null;
  nonaktif: boolean;
};

const awal: StatusTitik = { pesan: null, berhasil: false };

const kelasField = [
  "mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5",
  "text-base leading-normal text-ink",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
].join(" ");

const kelasLabel = "text-sm font-medium leading-normal text-ink";

const kelasTombolUtama =
  "rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none";

const kelasTombolKedua =
  "rounded-xl border border-line bg-surface px-4 py-2.5 text-base font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none";

/**
 * Ringkasan penetapan sebuah titik dalam satu baris.
 *
 * Tiga keadaan yang harus terbaca berbeda, karena artinya memang berbeda:
 * belum ditetapkan sama sekali, ditetapkan tapi dasarnya belum ada, dan
 * ditetapkan dengan dasar. Yang tengah itu yang paling mudah terlewat — dari
 * kejauhan ia terlihat sudah selesai, padahal peta warga tidak memakainya.
 */
function ringkasan(baris: BarisTitik, nama: Map<string, string>): string {
  const bagian: string[] = [];
  if (baris.kategori_tarif === null) {
    bagian.push("Kategori belum ditetapkan");
  } else {
    const dasar = baris.sumber_kategori;
    const labelDasar =
      dasar === null ? "tanpa dasar" : (LABEL_SUMBER_KATEGORI[dasar] ?? dasar);
    bagian.push(
      `${nama.get(baris.kategori_tarif) ?? baris.kategori_tarif} · ${labelDasar}`,
    );
  }
  bagian.push(
    baris.progresif === null
      ? "mode bayar belum diketahui"
      : baris.progresif
        ? "progresif"
        : "sekali bayar",
  );
  return bagian.join(" · ");
}

export function KelolaTitik({
  baris,
  kategori,
  batas,
  penyaring,
}: {
  baris: BarisTitik[];
  kategori: KategoriRef[];
  batas: number;
  penyaring: string;
}) {
  // Satu titik terbuka pada satu waktu. Formulir yang terbuka semua sekaligus
  // membuat 50 kotak pilihan tampil bersamaan tanpa satu pun yang sedang
  // dikerjakan.
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [status, simpanAction, menyimpan] = useActionState(
    simpanAtributTitik,
    awal,
  );

  const namaKategori = new Map(kategori.map((k) => [k.kode, k.nama]));

  return (
    <>
      {/*
        Hasil simpan dirender DI LUAR daftar, dan itu bukan soal tata letak.

        Begitu sebuah titik ditetapkan, barisnya biasanya keluar dari daftar —
        penyaring bawaannya "belum ditetapkan", dan titik itu sudah tidak masuk
        lagi. Waktu pesan ini masih di dalam formulir, ia ikut hilang bersama
        barisnya, sehingga yang terlihat hanya baris yang lenyap tanpa
        keterangan: tidak bisa dibedakan dari data yang terhapus.

        Pesan gagal pun bisa hilang dengan cara yang sama, dan itu lebih buruk —
        kegagalan yang tidak terlihat terbaca sebagai keberhasilan.
      */}
      {status.pesan && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-normal text-ink"
        >
          {status.pesan}
          {status.berhasil && penyaring === "belum" && (
            <>
              {" "}
              Barisnya keluar dari daftar ini karena penyaringnya{" "}
              <span className="font-medium">Belum ditetapkan</span> — titiknya
              sekarang ada di{" "}
              <span className="font-medium">Sudah ditetapkan</span>.
            </>
          )}
        </p>
      )}

      {baris.length === 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-10 text-center">
          <p className="text-base font-semibold leading-tight text-ink">
            Tidak ada titik yang cocok
          </p>
          <p className="mt-1 text-sm leading-normal text-ink-muted">
            Coba kata kunci lain, atau ganti penyaringnya.
          </p>
        </div>
      )}

      {baris.length > 0 && (
        <ul className="mt-4 space-y-2">
          {baris.map((t) => {
            const dibuka = terbuka === t.kode_titik;
            return (
              <li
                key={t.kode_titik}
                className="rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight text-ink">
                      {t.alamat}
                    </p>
                    <p className="mt-1 text-sm leading-normal text-ink-muted">
                      {t.wilayah ?? "Wilayah tidak tercatat"} ·{" "}
                      <code>{t.kode_titik}</code>
                    </p>
                    <p className="mt-1 text-sm leading-normal text-ink-muted">
                      {ringkasan(t, namaKategori)}
                    </p>
                    {t.nonaktif && (
                      <p className="mt-1 text-sm leading-normal text-ink">
                        Nonaktif — kode ini tidak ada lagi di data terbaru.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTerbuka(dibuka ? null : t.kode_titik)}
                    aria-expanded={dibuka}
                    className={kelasTombolKedua}
                  >
                    {dibuka ? "Tutup" : "Tetapkan"}
                  </button>
                </div>

                {dibuka && (
                  <form
                    action={simpanAction}
                    /*
                    key mengikat formulir ke satu kode titik. Tanpa ini, membuka
                    titik lain akan memakai ulang elemen yang sama beserta isinya
                    — dan penetapan milik titik sebelumnya ikut terbawa ke
                    formulir titik berikutnya.
                  */
                    key={t.kode_titik}
                    className="mt-3 border-t border-line pt-3"
                  >
                    <input
                      type="hidden"
                      name="kode_titik"
                      value={t.kode_titik}
                    />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          className={kelasLabel}
                          htmlFor={`k-${t.kode_titik}`}
                        >
                          Kategori tarif
                        </label>
                        <select
                          id={`k-${t.kode_titik}`}
                          name="kategori_tarif"
                          defaultValue={t.kategori_tarif ?? ""}
                          className={kelasField}
                        >
                          <option value="">Belum ditetapkan</option>
                          {kategori.map((k) => (
                            <option key={k.kode} value={k.kode}>
                              {k.nama}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          className={kelasLabel}
                          htmlFor={`s-${t.kode_titik}`}
                        >
                          Dasar penetapan
                        </label>
                        <select
                          id={`s-${t.kode_titik}`}
                          name="sumber_kategori"
                          defaultValue={t.sumber_kategori ?? ""}
                          className={kelasField}
                        >
                          <option value="">Belum ada</option>
                          <option value="perda">Perda</option>
                          <option value="kepwal">Keputusan Wali Kota</option>
                          <option value="uptd">Penetapan UPTD</option>
                          <option value="belum_verif">
                            Sementara, belum diverifikasi
                          </option>
                        </select>
                      </div>

                      <div>
                        <label
                          className={kelasLabel}
                          htmlFor={`p-${t.kode_titik}`}
                        >
                          Tarif progresif
                        </label>
                        <select
                          id={`p-${t.kode_titik}`}
                          name="progresif"
                          defaultValue={
                            t.progresif === null
                              ? ""
                              : t.progresif
                                ? "ya"
                                : "tidak"
                          }
                          className={kelasField}
                        >
                          <option value="">Belum diketahui</option>
                          <option value="ya">Ya, dihitung per jam</option>
                          <option value="tidak">Tidak, sekali bayar</option>
                        </select>
                      </div>
                    </div>

                    {/*
                    Dikatakan di sini, bukan disembunyikan sebagai galat setelah
                    disimpan: penetapan sementara tetap tercatat untuk petugas,
                    tapi tidak mengubah apa yang dilihat warga.
                  */}
                    <p className="mt-3 text-sm leading-normal text-ink-muted">
                      Peta warga hanya memakai kategori yang dasarnya Perda,
                      Keputusan Wali Kota, atau penetapan UPTD. Penetapan
                      sementara tersimpan di sini, tapi titiknya tetap
                      ditampilkan sebagai rentang.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        disabled={menyimpan}
                        className={kelasTombolUtama}
                      >
                        {menyimpan ? "Menyimpan…" : "Simpan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTerbuka(null)}
                        className={kelasTombolKedua}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {baris.length === batas && (
        <p className="mt-3 text-sm leading-normal text-ink-muted">
          Menampilkan {batas} titik pertama. Persempit dengan pencarian untuk
          menemukan alamat tertentu.
        </p>
      )}
    </>
  );
}
