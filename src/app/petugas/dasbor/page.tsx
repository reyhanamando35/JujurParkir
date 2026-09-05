import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPetugas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { keluar } from "../actions";
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

type BarisLaporan = {
  id: number;
  jalur: string;
  jenis: string;
  status: string;
  dibuat_pada: string;
};

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

export default async function DasborPage() {
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

  // Laporan. RLS yang membatasi cakupannya, bukan filter di sini.
  //
  // catatan dan foto_path SENGAJA tidak diambil: keduanya teks bebas dan
  // berkas kiriman warga yang bisa memuat identitas. Dasbor ini tidak
  // menampilkan identitas pelapor dalam bentuk apa pun.
  const { data: laporan } = await supabase
    .from("laporan")
    .select("id, jalur, jenis, status, dibuat_pada")
    .order("dibuat_pada", { ascending: false })
    .limit(50)
    .returns<BarisLaporan[]>();

  const daftarLaporan = laporan ?? [];
  const kosong = daftarLaporan.length === 0;

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

          <form action={keluar}>
            <button
              type="submit"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium leading-normal text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] motion-reduce:transition-none"
            >
              Keluar
            </button>
          </form>
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
            nilai={total.toLocaleString("id-ID")}
            keterangan="Perda tidak memetakan alamat ke kategori tarif"
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
            {kosong
              ? "Belum ada satu pun laporan dalam 14 hari terakhir, jadi garisnya masih rata di nol."
              : `${daftarLaporan.length} laporan tercatat dalam cakupanmu.`}
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          {kosong ? (
            <div className="px-4 py-10 text-center">
              <p className="text-base font-semibold leading-tight text-ink">
                Belum ada laporan masuk
              </p>
              <p className="mx-auto mt-1 max-w-[46ch] text-pretty text-sm leading-normal text-ink-muted">
                Ketika warga melaporkan tarif yang tidak sesuai, barisnya muncul
                di sini berisi tanggal, jenis dugaan pelanggaran, dan statusnya
                {dishub
                  ? " dari seluruh Kota Surabaya."
                  : ` dari wilayah ${namaWilayah} saja.`}
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
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarLaporan.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink">
                        {new Date(l.dibuat_pada).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-2 text-ink">{l.jenis}</td>
                      <td className="px-4 py-2 text-ink-muted">{l.jalur}</td>
                      <td className="px-4 py-2 text-ink">{l.status}</td>
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
