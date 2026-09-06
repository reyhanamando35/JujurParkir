import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";
import { jelaskanGalat } from "@/lib/galat";
import { labelJalur, labelJenis } from "@/lib/laporan";
import { createClient } from "@/lib/supabase/server";

import { TombolKeluar } from "../tombol-keluar";
import { UbahStatus } from "./ubah-status";
import {
  GrafikJamTutup,
  GrafikLaporanHarian,
  GrafikWilayah,
  type BatangJam,
  type BatangWilayah,
  type TitikHarian,
} from "./grafik-dasbor";

export const metadata: Metadata = {
  title: "Dasbor Petugas",
};

const WILAYAH = ["Pusat", "Utara", "Timur", "Selatan", "Barat"] as const;
type Wilayah = (typeof WILAYAH)[number];

/**
 * Peta kecamatan -> wilayah, kembar dengan yang ada di 0003_wilayah_rls.sql.
 *
 * Sengaja diduplikasi di sini alih-alih membaca kolom wilayah.bagian_kota:
 * kalau 0003 belum dijalankan di basis data, membacanya membuat SELURUH query
 * gagal dan dasbor jadi kosong. Yang menegakkan keamanan tetap policy di basis
 * data — daftar ini hanya untuk menamai badge peran.
 */
const KECAMATAN_KE_WILAYAH: Record<string, Wilayah> = {
  Genteng: "Pusat",
  Bubutan: "Pusat",
  Tegalsari: "Pusat",
  Simokerto: "Pusat",
  Bulak: "Utara",
  Kenjeran: "Utara",
  Semampir: "Utara",
  "Pabean Cantian": "Utara",
  Krembangan: "Utara",
  Gubeng: "Timur",
  "Gunung Anyar": "Timur",
  Sukolilo: "Timur",
  Tambaksari: "Timur",
  Mulyorejo: "Timur",
  Rungkut: "Timur",
  "Tenggilis Mejoyo": "Timur",
  Wonokromo: "Selatan",
  Wonocolo: "Selatan",
  Wiyung: "Selatan",
  "Karang Pilang": "Selatan",
  Jambangan: "Selatan",
  Gayungan: "Selatan",
  "Dukuh Pakis": "Selatan",
  Sawahan: "Selatan",
  Benowo: "Barat",
  Pakal: "Barat",
  Asemrowo: "Barat",
  Sukomanunggal: "Barat",
  Tandes: "Barat",
  Sambikerep: "Barat",
  Lakarsantri: "Barat",
};

type SifatTitik = {
  jam_mulai: string | null;
  jam_selesai: string | null;
  presisi: "jalan" | "perkiraan";
  wilayah: Wilayah;
};

/**
 * Kolom laporan yang boleh sampai ke dasbor.
 *
 * catatan dan foto_path tidak ada di sini, dan itu tetap disengaja seperti
 * sebelumnya: keduanya teks bebas dan berkas kiriman warga yang bisa memuat
 * identitas. Yang bertambah hanya koordinat dan waktu perubahan status.
 *
 * Koordinat bukan identitas pelapor — ia lokasi dugaan pelanggaran, hal yang
 * memang harus diketahui petugas untuk menindaklanjuti. Yang tidak pernah ada
 * di tabel ini sejak awal — nama, kontak, IP, akun — tetap tidak ada.
 */
type BarisLaporan = {
  id: number;
  jalur: string;
  jenis: string;
  status: string;
  dibuat_pada: string;
  titik_kode: string | null;
  bagian_kota: string | null;
  status_diubah_pada: string | null;
  lat: number | null;
  lng: number | null;
};

type TitikDekat = { alamat: string; lokasi: string; meter: number };

type BarisTampil = BarisLaporan & {
  alamat: string | null;
  terdekat: TitikDekat[];
};

/** Titik resmi lengkap dengan koordinatnya, untuk mencari yang terdekat. */
type TitikPeta = { kode: string; alamat: string; lokasi: string; lat: number; lng: number };

const SARINGAN = [
  { kunci: "semua", label: "Semua" },
  { kunci: "terdaftar", label: "Titik terdaftar" },
  { kunci: "luar", label: "Di luar daftar" },
  { kunci: "verifikasi", label: "Sudah diverifikasi" },
] as const;

type KunciSaring = (typeof SARINGAN)[number]["kunci"];

function adalahSaring(nilai: string | undefined): nilai is KunciSaring {
  return SARINGAN.some((s) => s.kunci === nilai);
}

function jarakMeter(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function teksJarak(meter: number): string {
  return meter < 1000
    ? `${Math.round(meter)} m`
    : `${(meter / 1000).toFixed(1)} km`;
}

/**
 * Tiga titik resmi terdekat dari sebuah koordinat.
 *
 * Ini yang menggantikan alamat untuk laporan Jalur B. Laporan di luar daftar
 * memang tidak punya alamat — warga menandai pin di peta, bukan memilih baris
 * berlamat — jadi tanpa ini yang terbaca petugas hanya dua angka desimal yang
 * tidak memberi tahu apa pun soal "ini di sekitar mana".
 *
 * Dihitung di server dan hanya hasilnya yang dikirim. Alternatifnya mengirim
 * seluruh 1.235 titik ke peramban petugas untuk dihitung di sana, padahal yang
 * dibutuhkan cuma tiga nama per baris.
 */
function tigaTerdekat(
  titik: TitikPeta[],
  lat: number,
  lng: number,
): TitikDekat[] {
  return titik
    .map((t) => ({
      alamat: t.alamat,
      lokasi: t.lokasi,
      meter: jarakMeter(lat, lng, t.lat, t.lng),
    }))
    .sort((a, b) => a.meter - b.meter)
    .slice(0, 3);
}

/**
 * Dibaca lewat fungsi terpisah dan hanya kalau memang ada laporan Jalur B.
 * Kebanyakan pemuatan dasbor tidak membutuhkannya sama sekali, dan mengurai
 * 347 KB GeoJSON untuk hasil yang tidak dipakai adalah biaya yang tidak perlu
 * dibayar di setiap kunjungan.
 */
async function bacaTitikPeta(): Promise<TitikPeta[]> {
  const berkas = join(process.cwd(), "public", "data", "titik-parkir.geojson");
  const isi = JSON.parse(await readFile(berkas, "utf8")) as {
    features: {
      id: string;
      properties: { alamat: string; lokasi: string };
      geometry: { coordinates: [number, number] };
    }[];
  };
  return isi.features.map((f) => ({
    kode: f.id,
    alamat: f.properties.alamat,
    lokasi: f.properties.lokasi,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

async function bacaTitik(): Promise<SifatTitik[]> {
  const berkas = join(process.cwd(), "public", "data", "titik-parkir.geojson");
  const isi = JSON.parse(await readFile(berkas, "utf8")) as {
    features: { properties: SifatTitik }[];
  };
  return isi.features.map((f) => f.properties);
}

const KELOMPOK_JAM = [
  "Sebelum 17.00",
  "17-20.00",
  "20-24.00",
  "24 jam",
  "Tidak diketahui",
];

function kelompokJamTutup(t: SifatTitik): string {
  if (t.jam_selesai === null) return "Tidak diketahui";
  if (t.jam_mulai === "00:00" && t.jam_selesai === "24:00") return "24 jam";
  const jam = Number(t.jam_selesai.slice(0, 2));
  if (jam < 17) return "Sebelum 17.00";
  if (jam < 20) return "17-20.00";
  return "20-24.00";
}

function Kartu({
  label,
  nilai,
  keterangan,
}: {
  label: string;
  nilai: string;
  keterangan: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm leading-normal text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-tight tabular-nums text-ink">
        {nilai}
      </p>
      <p className="mt-1 text-pretty text-sm leading-normal text-ink-muted">
        {keterangan}
      </p>
    </div>
  );
}

export default async function DasborPage({
  searchParams,
}: {
  searchParams: Promise<{ saring?: string }>;
}) {
  // Pemeriksaan sesungguhnya ada di sini, bukan di layout: layout tidak
  // dirender ulang saat navigasi antar rute, jadi tidak bisa diandalkan
  // sebagai penjaga. Proxy hanya lapisan pertama.
  const petugas = await getPetugas();
  if (!petugas) redirect("/petugas");

  const dishub = petugas.peran === "dishub";
  const supabase = await createClient();

  // Nama kecamatan petugas -> wilayah, hanya untuk badge peran.
  let wilayahKatar: Wilayah | null = null;
  if (!dishub && petugas.wilayah_id !== null) {
    const { data } = await supabase
      .from("wilayah")
      .select("nama")
      .eq("id", petugas.wilayah_id)
      .maybeSingle<{ nama: string }>();
    wilayahKatar = data ? (KECAMATAN_KE_WILAYAH[data.nama] ?? null) : null;
  }

  const semuaTitik = await bacaTitik();
  const dalamCakupan = dishub
    ? semuaTitik
    : semuaTitik.filter((t) => t.wilayah === wilayahKatar);

  const total = dalamCakupan.length;
  const jalan = dalamCakupan.filter((t) => t.presisi === "jalan").length;
  const jamTakTerbaca = dalamCakupan.filter((t) => t.jam_mulai === null).length;
  const persenJalan = total > 0 ? Math.round((jalan / total) * 100) : 0;

  const dataWilayah: BatangWilayah[] = WILAYAH.map((w) => ({
    wilayah: w,
    jumlah: semuaTitik.filter((t) => t.wilayah === w).length,
    terlihat: dishub || w === wilayahKatar,
  }));

  const dataJam: BatangJam[] = KELOMPOK_JAM.map((k) => ({
    kelompok: k,
    jumlah: dalamCakupan.filter((t) => kelompokJamTutup(t) === k).length,
  }));

  const terbanyak = [...dataWilayah]
    .filter((d) => d.terlihat)
    .sort((a, b) => b.jumlah - a.jumlah)[0];
  const jamTerbanyak = [...dataJam].sort((a, b) => b.jumlah - a.jumlah)[0];

  /**
   * Titik yang kategori tarifnya belum bisa dipakai — dari BASIS DATA, bukan
   * dari GeoJSON seperti tiga angka di atasnya.
   *
   * Harus begitu: GeoJSON dibangkitkan dari hasil scraping dan tidak punya
   * kolom kategori sama sekali, sedangkan kategori ditetapkan petugas lewat
   * /petugas/titik. Sebelum ini angkanya memakai `total`, yang kebetulan benar
   * selama belum ada satu pun penetapan — dan akan diam-diam salah begitu
   * penetapan pertama masuk.
   *
   * Yang dihitung sengaja "belum bisa dipakai", bukan sekadar "kategorinya
   * kosong": kategori yang dasarnya masih sementara tidak menyempitkan angka
   * yang dilihat warga (lihat `sumberMengikat`), jadi menghitungnya sebagai
   * selesai membuat dasbor mengklaim kemajuan yang tidak sampai ke peta.
   */
  let belumBerkategori: number | null = null;
  if (dishub || wilayahKatar !== null) {
    let kueri = supabase
      .from("titik_parkir")
      .select("kode_titik", { count: "exact", head: true })
      .eq("nonaktif", false)
      .or(
        "kategori_tarif.is.null,sumber_kategori.is.null,sumber_kategori.eq.belum_verif",
      );
    if (!dishub) kueri = kueri.eq("wilayah", wilayahKatar);

    const { count, error } = await kueri;
    if (error) {
      // null, BUKAN nol. Nol berarti semua titik sudah berkategori — pernyataan
      // yang justru terbalik dari keadaan sebenarnya, dan kartunya akan terbaca
      // seolah pekerjaannya sudah selesai.
      console.error(`[dasbor] gagal menghitung kategori: ${jelaskanGalat(error)}`);
    } else {
      belumBerkategori = count ?? 0;
    }
  } else {
    // Katar tanpa wilayah terpetakan: cakupannya memang kosong, sama seperti
    // `total` di atas yang juga nol.
    belumBerkategori = 0;
  }

  // Laporan. RLS yang membatasi cakupannya, bukan filter di sini.
  //
  // catatan dan foto_path SENGAJA tidak diambil: keduanya teks bebas dan
  // berkas kiriman warga yang bisa memuat identitas. Dasbor ini tidak
  // menampilkan identitas pelapor dalam bentuk apa pun.
  const { saring } = await searchParams;
  const penyaring: KunciSaring = adalahSaring(saring) ? saring : "semua";

  /*
    Dibaca dari view laporan_petugas, bukan dari tabelnya langsung — view itu
    yang sudah menyediakan lat/lng sebagai angka biasa (st_y/st_x di 0006).
    Cakupan wilayah tetap ditegakkan RLS: view-nya security_invoker = true,
    jadi policy "petugas baca laporan" yang menentukan baris mana yang
    terlihat. Katar tidak pernah disaring di sini.
  */
  let kueri = supabase
    .from("laporan_petugas")
    .select(
      "id, jalur, jenis, status, dibuat_pada, titik_kode, bagian_kota, status_diubah_pada, lat, lng",
    );

  if (penyaring === "terdaftar") kueri = kueri.eq("jalur", "terdaftar");
  if (penyaring === "luar") kueri = kueri.eq("jalur", "luar_daftar");
  // "Sudah diverifikasi" berarti sudah sampai keputusan akhir — terverifikasi
  // maupun ditolak. Yang masih 'baru' atau 'proses' belum diputuskan apa pun.
  if (penyaring === "verifikasi") kueri = kueri.in("status", ["selesai", "ditolak"]);

  const { data: laporan, error: galatLaporan } = await kueri
    .order("dibuat_pada", { ascending: false })
    .limit(50)
    .returns<BarisLaporan[]>();

  if (galatLaporan) {
    console.error(`[dasbor] gagal membaca laporan: ${jelaskanGalat(galatLaporan)}`);
  }

  const daftarLaporan = laporan ?? [];
  const kosong = daftarLaporan.length === 0;
  const gagalLaporan = Boolean(galatLaporan);

  // Alamat untuk Jalur A, tiga titik terdekat untuk Jalur B. GeoJSON hanya
  // dibaca kalau salah satunya memang dibutuhkan.
  const perluTitik = daftarLaporan.some(
    (l) => l.titik_kode !== null || (l.lat !== null && l.lng !== null),
  );
  const titikPeta = perluTitik ? await bacaTitikPeta() : [];
  const indeksTitik = new Map(titikPeta.map((t) => [t.kode, t]));

  const barisTampil: BarisTampil[] = daftarLaporan.map((l) => {
    const resmi = l.titik_kode ? indeksTitik.get(l.titik_kode) : undefined;
    return {
      ...l,
      alamat: resmi?.alamat ?? null,
      terdekat:
        l.jalur === "luar_daftar" && l.lat !== null && l.lng !== null
          ? tigaTerdekat(titikPeta, l.lat, l.lng)
          : [],
    };
  });

  const hariIni = new Date();
  const deret: TitikHarian[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(hariIni);
    d.setDate(d.getDate() - (13 - i));
    const tanggal = d.toISOString().slice(0, 10);
    return {
      tanggal,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      jumlah: daftarLaporan.filter(
        (l) => l.dibuat_pada.slice(0, 10) === tanggal,
      ).length,
    };
  });

  const namaWilayah = wilayahKatar ?? "belum diatur";

  return (
    <main className="flex flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
              Dasbor {dishub ? "Dishub" : "Koordinator Wilayah"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-base leading-normal text-ink-muted">
                {petugas.nama}
              </span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold leading-normal text-accent-ink">
                {dishub
                  ? "Dishub - seluruh kota"
                  : `Katar - Surabaya ${namaWilayah}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/petugas/laporan"
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
            >
              Verifikasi laporan
            </Link>
            {/*
              Hanya Dishub. Tarif berlaku sekota, jadi bukan wewenang Katar —
              dan halaman tujuannya pun menolak Katar, sama seperti policy di
              basis data.
            */}
            {dishub && (
              <Link
                href="/petugas/tarif"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                Tarif rujukan
              </Link>
            )}
            {dishub && (
              <Link
                href="/petugas/titik"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                Kategori titik
              </Link>
            )}
            {/* Konfirmasi dua langkah — lihat alasannya di komponennya. */}
            <TombolKeluar />
          </div>
        </div>

        {/* ---------- BAGIAN 1 ---------- */}
        <h2 className="mt-8 text-lg font-semibold leading-tight text-ink">
          Kondisi data titik parkir
        </h2>
        <p className="mt-1 max-w-[70ch] text-pretty text-sm leading-normal text-ink-muted">
          Pengelompokan wilayah di bawah ini adalah{" "}
          <span className="font-medium text-ink">
            perkiraan yang diturunkan dari koordinat
          </span>
          , bukan batas administratif resmi. Kami belum punya poligon kecamatan,
          jadi titik di dekat garis batas bisa masuk ke wilayah yang keliru.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kartu
            label="Titik dalam cakupan"
            nilai={total.toLocaleString("id-ID")}
            keterangan={
              dishub ? "Seluruh Kota Surabaya" : `Wilayah ${namaWilayah}`
            }
          />
          <Kartu
            label="Posisi tingkat ruas jalan"
            nilai={`${jalan.toLocaleString("id-ID")} (${persenJalan}%)`}
            keterangan="Pin mewakili tengah ruas jalan, bukan titik persis"
          />
          <Kartu
            label="Jam jaga tidak terbaca"
            nilai={jamTakTerbaca.toLocaleString("id-ID")}
            keterangan="Format aslinya rusak dan tidak ditebak"
          />
          <Kartu
            label="Kategori tarif belum diketahui"
            nilai={
              belumBerkategori === null
                ? "—"
                : belumBerkategori.toLocaleString("id-ID")
            }
            keterangan={
              belumBerkategori === null
                ? "Angkanya gagal dibaca dari basis data"
                : belumBerkategori === 0
                  ? "Semua titik dalam cakupan sudah punya kategori bersumber"
                  : "Perda tidak memetakan alamat ke kategori; ditetapkan manual di Kategori titik"
            }
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-base font-semibold leading-tight text-ink">
              Jumlah titik per wilayah
            </h3>
            <div className="mt-3">
              <GrafikWilayah data={dataWilayah} />
            </div>
            <p className="mt-3 text-pretty text-sm leading-normal text-ink-muted">
              {dishub
                ? `Sebarannya tidak merata: ${terbanyak.wilayah} memuat ${terbanyak.jumlah} titik, terbanyak dari lima wilayah.`
                : `Wilayah ${namaWilayah} memuat ${terbanyak?.jumlah ?? 0} titik parkir. Angka wilayah lain berada di luar cakupanmu dan sengaja tidak ditampilkan.`}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-base font-semibold leading-tight text-ink">
              Sebaran jam tutup
            </h3>
            <div className="mt-3">
              <GrafikJamTutup data={dataJam} />
            </div>
            <p className="mt-3 text-pretty text-sm leading-normal text-ink-muted">
              Kelompok terbesar adalah {jamTerbanyak.kelompok} dengan{" "}
              {jamTerbanyak.jumlah} titik.
            </p>
          </div>
        </div>

        {/* ---------- BAGIAN 2 ---------- */}
        <h2 className="mt-8 text-lg font-semibold leading-tight text-ink">
          Laporan warga
        </h2>
        <p className="mt-1 max-w-[70ch] text-pretty text-sm leading-normal text-ink-muted">
          Laporan tidak pernah memuat nama, nomor telepon, email, atau NIK
          pelapor — tabelnya memang tidak menyimpannya. Itu keputusan desain,
          bukan kolom yang kebetulan kosong.
        </p>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold leading-tight text-ink">
            Laporan masuk per hari, 14 hari terakhir
          </h3>
          <div className="mt-3">
            <GrafikLaporanHarian data={deret} kosong={kosong} />
          </div>
          <p className="mt-3 text-pretty text-sm leading-normal text-ink-muted">
            {/*
              Grafik ini membaca kumpulan yang SAMA dengan tabel di bawah, jadi
              ia ikut menyempit saat disaring. Itu disengaja — grafik dan tabel
              yang menghitung himpunan berbeda di satu layar adalah cara cepat
              membuat orang salah membaca keduanya. Saringan yang sedang aktif
              karena itu harus disebut di kalimat ini.
            */}
            {kosong
              ? "Belum ada satu pun laporan dalam 14 hari terakhir, jadi garisnya masih rata di nol."
              : `${daftarLaporan.length} laporan tercatat dalam cakupanmu${
                  penyaring === "semua"
                    ? ""
                    : ` dengan saringan “${
                        SARINGAN.find((s) => s.kunci === penyaring)?.label ?? ""
                      }”`
                }.`}
          </p>
        </div>

        {/*
          Penyaring berupa tautan, bukan tombol berstate.

          Alasannya bukan kesederhanaan: dengan tautan, saringan ikut tersimpan
          di URL, jadi petugas bisa menandai halaman "di luar daftar" atau
          mengirimkannya ke rekannya. Penyaringannya sendiri terjadi di kueri
          basis data, bukan di peramban — daftar yang tidak dipilih memang
          tidak pernah dikirim ke sini.
        */}
        <nav aria-label="Saring laporan" className="mt-4 flex flex-wrap gap-1.5">
          {SARINGAN.map((s) => {
            const aktif = s.kunci === penyaring;
            return (
              <Link
                key={s.kunci}
                href={
                  s.kunci === "semua"
                    ? "/petugas/dasbor"
                    : `/petugas/dasbor?saring=${s.kunci}`
                }
                aria-current={aktif ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm leading-normal transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none ${
                  aktif
                    ? "border-accent bg-accent font-semibold text-accent-ink"
                    : "border-line bg-surface text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        {gagalLaporan && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-normal text-ink"
          >
            Daftar laporan gagal dimuat — tabel di bawah kosong karena kuerinya
            ditolak, bukan karena tidak ada laporan. Alasan lengkapnya tercetak
            di log server.
          </p>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          {kosong ? (
            <div className="px-4 py-10 text-center">
              <p className="text-base font-semibold leading-tight text-ink">
                {gagalLaporan
                  ? "Isi daftar laporan tidak diketahui"
                  : penyaring === "semua"
                    ? "Belum ada laporan masuk"
                    : "Tidak ada laporan yang cocok dengan saringan ini"}
              </p>
              <p className="mx-auto mt-1 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
                {gagalLaporan ? (
                  "Jangan menyimpulkan apa pun dari tabel kosong ini sampai kuerinya berhasil."
                ) : penyaring === "semua" ? (
                  <>
                    Ketika warga melaporkan tarif yang tidak sesuai, barisnya
                    muncul di sini berisi tanggal, jenis dugaan pelanggaran,
                    lokasi, dan statusnya
                    {dishub
                      ? " dari seluruh Kota Surabaya."
                      : ` dari wilayah ${namaWilayah} saja.`}
                  </>
                ) : (
                  "Laporannya mungkin ada di saringan lain — coba “Semua”."
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Tanggal</th>
                    <th className="px-4 py-2 font-medium">Jenis</th>
                    <th className="px-4 py-2 font-medium">Jalur</th>
                    <th className="px-4 py-2 font-medium">Lokasi</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {barisTampil.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-line align-top last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink">
                        {new Date(l.dibuat_pada).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-2 text-ink">
                        {labelJenis(l.jenis)}
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {labelJalur(l.jalur)}
                      </td>

                      {/*
                        Jalur A punya alamat titik resmi. Jalur B tidak punya
                        alamat sama sekali — warga menandai pin, bukan memilih
                        baris beralamat — jadi yang menggantikannya adalah
                        koordinat plus tiga titik resmi terdekat berikut
                        jaraknya. Itu yang menjawab "ini di sekitar mana".
                      */}
                      <td className="px-4 py-2 text-ink">
                        {l.alamat ? (
                          <span>{l.alamat}</span>
                        ) : l.lat !== null && l.lng !== null ? (
                          <div className="min-w-52">
                            <p className="tabular-nums text-ink">
                              {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                              {l.bagian_kota ? ` · ${l.bagian_kota}` : ""}
                            </p>
                            {l.terdekat.length > 0 && (
                              <>
                                <p className="mt-1 text-sm text-ink-muted">
                                  Titik resmi terdekat:
                                </p>
                                <ul className="mt-0.5 space-y-0.5 text-sm text-ink-muted">
                                  {l.terdekat.map((t, i) => (
                                    <li key={`${l.id}-${i}`}>
                                      {t.alamat}{" "}
                                      <span className="tabular-nums">
                                        ({teksJarak(t.meter)})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-muted">
                            Lokasi tidak tercatat
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2 text-ink">
                        <UbahStatus id={l.id} status={l.status} />
                        <p className="mt-1 text-sm text-ink-muted">
                          {l.status_diubah_pada
                            ? `Diubah ${new Date(
                                l.status_diubah_pada,
                              ).toLocaleString("id-ID", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}`
                            : "Belum pernah diubah"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
