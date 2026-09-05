"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { kirimLaporan, type StatusLapor } from "@/app/warga/actions";

export type TitikRingkas = {
  kode: string;
  alamat: string;
  lokasi: string;
  wilayah: string;
};

export type Terdekat = { titik: TitikRingkas; jarak: number };

/**
 * Apa yang sedang dilaporkan.
 *
 * "titik"  — warga menekan tombol di popup sebuah titik resmi.
 * "pilih"  — warga mengetuk area kosong peta; belum diputuskan apakah ini
 *            titik resmi terdekat atau lokasi yang memang tak terdaftar.
 */
export type Sasaran =
  | { mode: "titik"; titik: TitikRingkas }
  | { mode: "pilih"; lat: number; lng: number; terdekat: Terdekat[] };

type Pilihan =
  | { jalur: "terdaftar"; titik: TitikRingkas }
  | { jalur: "luar_daftar"; lat: number; lng: number };

/**
 * Apa yang baru saja tersimpan, dikabarkan ke peta supaya angkanya bisa
 * langsung naik. Sengaja hanya membawa lokasinya — bukan `Pilihan` utuh, dan
 * tidak pernah isi laporannya.
 */
export type Terkirim =
  | { jalur: "terdaftar"; kode: string }
  | { jalur: "luar_daftar"; lat: number; lng: number };

const awal: StatusLapor = { pesan: null, kode: null };

const JEDA_MS = 30_000;
const KUNCI_JEDA = "jujurparkir:lapor-terakhir";
const KUNCI_KODE = "jujurparkir:kode-laporan";
const BATAS_FOTO_BYTE = 10 * 1024 * 1024;

/**
 * Pilihan jenis ditulis sebagai APA YANG DILIHAT pelapor, bukan tuduhan.
 * "Saya diminta membayar lebih" bisa dipertanggungjawabkan oleh orang yang
 * berdiri di sana; "petugas melakukan pungutan liar" adalah kesimpulan hukum
 * yang bukan wewenang pelapor maupun aplikasi ini.
 */
const JENIS_TERDAFTAR = [
  { nilai: "tarif_lebih", label: "Saya diminta membayar lebih dari tarif resmi" },
  { nilai: "parkir_liar", label: "Parkir sembarangan atau di tengah jalan" },
  { nilai: "lainnya", label: "Lainnya" },
] as const;

const JENIS_LUAR_DAFTAR = [
  {
    nilai: "pungutan_area_gratis",
    label: "Ada pungutan parkir di area yang seharusnya gratis",
  },
  { nilai: "parkir_liar", label: "Parkir sembarangan atau di tengah jalan" },
  { nilai: "lainnya", label: "Lainnya" },
] as const;

const JENIS_AWAL = {
  terdaftar: "tarif_lebih",
  luar_daftar: "pungutan_area_gratis",
} as const;

/**
 * Placeholder keterangan dibuat memandu, bukan sekadar "tulis sesuatu".
 * Nominal yang diminta jukir sekarang ditulis di sini, jadi contohnya harus
 * kelihatan — kalau tidak, kolom ini akan terisi "parkir mahal" saja dan
 * laporannya tidak bisa ditindaklanjuti.
 */
const PETUNJUK_KETERANGAN: Record<string, string> = {
  tarif_lebih:
    "Contoh: saya parkir motor 20 menit, diminta bayar Rp5.000 dan tidak diberi karcis.",
  parkir_liar:
    "Contoh: kendaraan diparkir sampai badan jalan sehingga hanya satu mobil yang bisa lewat.",
  pungutan_area_gratis:
    "Contoh: di halaman minimarket ini biasanya gratis, tapi saya diminta bayar Rp2.000.",
  lainnya: "Ceritakan apa yang kamu lihat dan alami di lokasi ini.",
};

const kelasField = [
  "mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5",
  "text-base leading-normal text-ink placeholder:text-ink-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
].join(" ");

const kelasLabel = "text-sm font-medium leading-normal text-ink";

/**
 * Menyandikan ulang gambar lewat Canvas.
 *
 * INI PERLINDUNGAN PRIVASI, BUKAN OPTIMASI UKURAN — jangan dilewati.
 * Foto dari galeri ponsel hampir selalu membawa metadata EXIF, dan di dalamnya
 * sering ada koordinat GPS tempat foto diambil. Untuk laporan parkir, koordinat
 * itu bisa saja rumah pelapor. Menggambar ulang ke canvas lalu meng-encode
 * ulang hanya menyalin pikselnya; seluruh metadata tertinggal.
 */
async function siapkanFoto(berkas: File): Promise<File> {
  const bitmap = await createImageBitmap(berkas);
  const skala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const lebar = Math.max(1, Math.round(bitmap.width * skala));
  const tinggi = Math.max(1, Math.round(bitmap.height * skala));

  const kanvas = document.createElement("canvas");
  kanvas.width = lebar;
  kanvas.height = tinggi;
  const ctx = kanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.drawImage(bitmap, 0, 0, lebar, tinggi);
  bitmap.close();

  const blob = await new Promise<Blob | null>((selesai) =>
    kanvas.toBlob(selesai, "image/jpeg", 0.8),
  );
  if (!blob) throw new Error("Gagal menyandikan ulang foto");
  return new File([blob], "laporan.jpg", { type: "image/jpeg" });
}

function waktuLokalSekarang(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LaporWarga({
  sasaran,
  onTutup,
  onTerkirim,
}: {
  sasaran: Sasaran;
  onTutup: () => void;
  onTerkirim?: (info: Terkirim) => void;
}) {
  // Diambil sekali dari props. Peta memberi komponen ini `key` yang berubah
  // begitu sasarannya berganti titik, jadi React me-mount ulang dan state awal
  // di bawah ikut segar — tanpa perlu efek yang menyalin props ke state.
  const [pilihan, setPilihan] = useState<Pilihan | null>(
    sasaran.mode === "titik"
      ? { jalur: "terdaftar", titik: sasaran.titik }
      : null,
  );
  const [jenisTerpilih, setJenisTerpilih] = useState<string>(
    sasaran.mode === "titik" ? JENIS_AWAL.terdaftar : JENIS_AWAL.luar_daftar,
  );
  const [status, formAction, menunggu] = useActionState(kirimLaporan, awal);
  const [fotoSiap, setFotoSiap] = useState<File | null>(null);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const [sedangOlahFoto, setSedangOlahFoto] = useState(false);

  // Menahan kabar ke peta supaya terkirim tepat sekali per laporan. Menulis
  // localStorage dua kali tidak berbahaya, tapi menaikkan angka dua kali iya —
  // dan StrictMode memang menjalankan efek dua kali di `next dev`.
  const sudahDikabarkan = useRef(false);

  useEffect(() => {
    if (!status.kode) return;

    try {
      localStorage.setItem(KUNCI_JEDA, String(Date.now()));
      localStorage.setItem(KUNCI_KODE, status.kode);
    } catch {
      // Mode penyamaran memblokir localStorage. Kodenya tetap tampil di layar.
    }

    if (sudahDikabarkan.current || !pilihan) return;
    sudahDikabarkan.current = true;
    onTerkirim?.(
      pilihan.jalur === "terdaftar"
        ? { jalur: "terdaftar", kode: pilihan.titik.kode }
        : { jalur: "luar_daftar", lat: pilihan.lat, lng: pilihan.lng },
    );
  }, [status.kode, pilihan, onTerkirim]);

  const aksi = (data: FormData) => {
    setGalatLokal(null);

    let terakhir = 0;
    try {
      terakhir = Number(localStorage.getItem(KUNCI_JEDA) ?? 0);
    } catch {
      terakhir = 0;
    }
    const sisa = JEDA_MS - (Date.now() - terakhir);
    if (Number.isFinite(terakhir) && terakhir > 0 && sisa > 0) {
      setGalatLokal(
        `Tunggu ${Math.ceil(sisa / 1000)} detik lagi sebelum mengirim laporan berikutnya.`,
      );
      return;
    }

    // Berkas yang ikut terkirim adalah hasil sandi ulang, bukan berkas asli
    // dari galeri. Input file-nya sendiri tidak punya atribut name.
    if (fotoSiap) data.set("foto", fotoSiap);
    formAction(data);
  };

  const pilihFoto = async (berkas: File | null) => {
    setGalatLokal(null);
    if (!berkas) {
      setFotoSiap(null);
      return;
    }
    if (berkas.size > BATAS_FOTO_BYTE) {
      setFotoSiap(null);
      setGalatLokal("Foto terlalu besar. Maksimal 10 MB.");
      return;
    }
    setSedangOlahFoto(true);
    try {
      setFotoSiap(await siapkanFoto(berkas));
    } catch {
      setFotoSiap(null);
      setGalatLokal("Foto tidak bisa dibaca. Coba pilih berkas lain.");
    } finally {
      setSedangOlahFoto(false);
    }
  };

  // ---------- Berhasil ----------
  if (status.kode) {
    return (
      <Panel judul="Laporan terkirim" onTutup={onTutup}>
        <p className="text-pretty text-base leading-normal text-ink">
          Terima kasih. Laporanmu sudah masuk dan akan ditinjau petugas.
        </p>
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-center">
          <p className="text-sm leading-normal text-ink-muted">Kode laporan</p>
          <p className="mt-1 text-2xl font-bold tracking-widest text-ink">
            {status.kode}
          </p>
        </div>
        <p className="mt-3 text-pretty text-sm leading-normal text-ink-muted">
          Simpan kode ini kalau sewaktu-waktu perlu menyebutkannya. Kode ini
          tidak terhubung ke nama, nomor, atau akun siapa pun.
        </p>
        <button
          type="button"
          onClick={onTutup}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-base font-semibold text-accent-ink"
        >
          Selesai
        </button>
      </Panel>
    );
  }

  // ---------- Ketukan pertama: pilih lokasinya dulu ----------
  if (pilihan === null && sasaran.mode === "pilih") {
    return (
      <Panel judul="Lokasi mana yang kamu maksud?" onTutup={onTutup}>
        <p className="text-pretty text-sm leading-normal text-ink-muted">
          {sasaran.terdekat.length > 0
            ? "Geser pin di peta kalau posisinya belum tepat. Banyak titik resmi hanya ditandai di tengah ruas jalan, jadi kamu yang menentukan — bukan aplikasinya."
            : "Tidak ada titik parkir resmi dalam 100 m dari pin. Geser pin kalau posisinya belum tepat; kalau memang di sini, lanjutkan sebagai lokasi tidak terdaftar."}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {sasaran.terdekat.map(({ titik, jarak }) => (
            <li key={titik.kode}>
              <button
                type="button"
                onClick={() => {
                  setJenisTerpilih(JENIS_AWAL.terdaftar);
                  setPilihan({ jalur: "terdaftar", titik });
                }}
                className="w-full rounded-xl border border-line bg-surface p-3 text-left hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="block text-base font-medium leading-tight text-ink">
                  {titik.alamat}
                </span>
                <span className="mt-0.5 block text-sm leading-normal text-ink-muted">
                  {titik.lokasi ? `${titik.lokasi} · ` : ""}
                  {jarak < 1000
                    ? `${Math.round(jarak)} m dari pin`
                    : `${(jarak / 1000).toFixed(1)} km dari pin`}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setJenisTerpilih(JENIS_AWAL.luar_daftar);
                setPilihan({
                  jalur: "luar_daftar",
                  lat: sasaran.lat,
                  lng: sasaran.lng,
                });
              }}
              className="w-full rounded-xl border border-dashed border-accent bg-surface p-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="block text-base font-medium leading-tight text-accent">
                Bukan salah satu — lokasi ini tidak terdaftar
              </span>
              <span className="mt-0.5 block text-sm leading-normal text-ink-muted">
                Laporan dikirim dengan koordinat pin yang kamu tandai.
              </span>
            </button>
          </li>
        </ul>
      </Panel>
    );
  }

  if (pilihan === null) return null;

  // ---------- Formulir ----------
  const daftarJenis =
    pilihan.jalur === "terdaftar" ? JENIS_TERDAFTAR : JENIS_LUAR_DAFTAR;

  return (
    <Panel judul="Buat laporan" onTutup={onTutup}>
      <p className="text-pretty text-sm leading-normal text-ink-muted">
        {pilihan.jalur === "terdaftar" ? (
          <>
            Tentang titik resmi{" "}
            <span className="font-medium text-ink">{pilihan.titik.alamat}</span>
            .
          </>
        ) : (
          <>
            Tentang lokasi yang kamu tandai di peta, yang menurutmu tidak
            terdaftar.
          </>
        )}
      </p>

      <form action={aksi} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="jalur" value={pilihan.jalur} />
        {pilihan.jalur === "terdaftar" ? (
          <>
            <input
              type="hidden"
              name="titik_kode"
              value={pilihan.titik.kode}
            />
            <input
              type="hidden"
              name="bagian_kota"
              value={pilihan.titik.wilayah}
            />
          </>
        ) : (
          <>
            <input type="hidden" name="lat" value={pilihan.lat} />
            <input type="hidden" name="lng" value={pilihan.lng} />
          </>
        )}

        {/*
          Honeypot. Disembunyikan dari mata dan dari pembaca layar, tapi tetap
          terisi oleh bot pengisi formulir otomatis. Diperiksa lagi di server.
        */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-0">
          <label htmlFor="sapaan">Jangan diisi</label>
          <input id="sapaan" name="sapaan" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <fieldset>
          <legend className={kelasLabel}>Apa yang kamu alami?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {daftarJenis.map((j) => (
              <label
                key={j.nilai}
                className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3"
              >
                <input
                  type="radio"
                  name="jenis"
                  value={j.nilai}
                  required
                  checked={jenisTerpilih === j.nilai}
                  onChange={() => setJenisTerpilih(j.nilai)}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <span className="text-base leading-normal text-ink">
                  {j.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="catatan" className={kelasLabel}>
            Keterangan
          </label>
          {jenisTerpilih === "lainnya" && (
            <p className="mt-1 text-sm leading-normal text-ink">
              Karena kamu memilih &ldquo;Lainnya&rdquo;, tuliskan apa yang
              terjadi di sini.
            </p>
          )}
          <textarea
            id="catatan"
            name="catatan"
            rows={4}
            required
            maxLength={500}
            placeholder={PETUNJUK_KETERANGAN[jenisTerpilih]}
            className={kelasField}
          />
          <p className="mt-1 text-sm leading-normal text-ink-muted">
            Maksimal 500 karakter. Sebutkan nominal yang diminta kalau ada.
            Jangan tulis nama atau nomor siapa pun.
          </p>
        </div>

        <fieldset>
          <legend className={kelasLabel}>Kendaraan</legend>
          <div className="mt-2 flex gap-2">
            {(["motor", "mobil"] as const).map((k, i) => (
              <label
                key={k}
                className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface p-3"
              >
                <input
                  type="radio"
                  name="jenis_kendaraan"
                  value={k}
                  required
                  defaultChecked={i === 0}
                  className="size-4 accent-accent"
                />
                <span className="text-base capitalize text-ink">{k}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="waktu_kejadian" className={kelasLabel}>
            Waktu kejadian
          </label>
          <input
            id="waktu_kejadian"
            name="waktu_kejadian"
            type="datetime-local"
            defaultValue={waktuLokalSekarang()}
            className={kelasField}
          />
        </div>

        <div>
          <label htmlFor="foto" className={kelasLabel}>
            Foto <span className="text-ink-muted">(opsional)</span>
          </label>
          <input
            id="foto"
            type="file"
            accept="image/*"
            onChange={(e) => void pilihFoto(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-ink"
          />
          <p className="mt-1 text-sm leading-normal text-ink-muted">
            {sedangOlahFoto
              ? "Memproses foto…"
              : fotoSiap
                ? "Foto siap dikirim. Data lokasi bawaan foto sudah dibuang."
                : "Foto akan diperkecil dan data lokasi bawaannya dibuang sebelum dikirim."}
          </p>
        </div>

        <p
          role="alert"
          aria-live="polite"
          className="min-h-5 text-sm leading-normal text-ink"
        >
          {galatLokal ?? status.pesan}
        </p>

        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-pretty text-sm leading-normal text-ink">
            Laporan ini <span className="font-medium">anonim</span> — tidak ada
            nama, nomor, atau akun yang ikut terkirim — dan{" "}
            <span className="font-medium">tidak dapat ditarik kembali</span>{" "}
            setelah dikirim.
          </p>
        </div>

        <button
          type="submit"
          disabled={menunggu || sedangOlahFoto}
          className="rounded-xl bg-accent px-4 py-3 text-base font-semibold text-accent-ink hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menunggu ? "Mengirim…" : "Kirim laporan"}
        </button>
      </form>
    </Panel>
  );
}

function Panel({
  judul,
  onTutup,
  children,
}: {
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onTutup}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold leading-tight text-ink">{judul}</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden="true"
              className="size-5"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
