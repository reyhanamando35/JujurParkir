"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Warna diambil sebagai hex, bukan var(--...), karena Recharts menuliskannya
 * ke atribut SVG dan sebagian atribut tidak menerima custom property. Nilainya
 * disalin dari token di globals.css.
 */
const AKSEN = "#9a5300";
const REDUP = "#94a3b8";
const GARIS = "#cbd5e1";
const TEKS = "#4c5b76";

export type BatangWilayah = {
  wilayah: string;
  jumlah: number;
  /** Katar hanya boleh melihat angka wilayahnya sendiri. */
  terlihat: boolean;
};

export type BatangJam = { kelompok: string; jumlah: number };
export type TitikHarian = { tanggal: string; label: string; jumlah: number };

const gayaSumbu = { fill: TEKS, fontSize: 12 };

function Bingkai({ children }: { children: React.ReactNode }) {
  // Tinggi eksplisit wajib: ResponsiveContainer mengukur induknya, dan induk
  // setinggi auto membuat grafiknya tidak pernah tergambar sama sekali.
  return <div className="h-64 w-full">{children}</div>;
}

export function GrafikWilayah({ data }: { data: BatangWilayah[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Bingkai>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke={GARIS} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="wilayah" tick={gayaSumbu} stroke={GARIS} />
              <YAxis tick={gayaSumbu} stroke={GARIS} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.15)" }}
                formatter={(nilai, _nama, isi) =>
                  (isi as { payload?: BatangWilayah } | undefined)?.payload
                    ?.terlihat
                    ? [`${nilai} titik`, "Jumlah"]
                    : ["Di luar cakupan kamu", "Jumlah"]
                }
              />
              <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.wilayah} fill={d.terlihat ? AKSEN : REDUP} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Bingkai>
      </div>

      {/* Di layar sempit grafik batang jadi gepeng dan labelnya bertumpuk. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {data.map((d) => (
          <li key={d.wilayah} className="flex items-center justify-between gap-3">
            <span className={d.terlihat ? "text-ink" : "text-ink-muted"}>
              {d.wilayah}
            </span>
            <span
              className={
                d.terlihat
                  ? "font-semibold tabular-nums text-ink"
                  : "text-sm text-ink-muted"
              }
            >
              {d.terlihat ? `${d.jumlah} titik` : "Di luar cakupan"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function GrafikJamTutup({ data }: { data: BatangJam[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Bingkai>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke={GARIS} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="kelompok" tick={gayaSumbu} stroke={GARIS} interval={0} />
              <YAxis tick={gayaSumbu} stroke={GARIS} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.15)" }}
                formatter={(nilai) => [`${nilai} titik`, "Jumlah"]}
              />
              <Bar
                dataKey="jumlah"
                fill={AKSEN}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </Bingkai>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {data.map((d) => (
          <li key={d.kelompok} className="flex items-center justify-between gap-3">
            <span className="text-ink">{d.kelompok}</span>
            <span className="font-semibold tabular-nums text-ink">{d.jumlah}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function GrafikLaporanHarian({
  data,
  kosong,
}: {
  data: TitikHarian[];
  kosong: boolean;
}) {
  return (
    <div className="relative">
      <Bingkai>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={GARIS} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={gayaSumbu}
              stroke={GARIS}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            {/*
              Domain dikunci 0..4 saat kosong supaya sumbu Y tetap berskala
              masuk akal. Dibiarkan otomatis, Recharts menggambar 0..0 dan
              hasilnya bingkai tanpa arti.
            */}
            <YAxis
              tick={gayaSumbu}
              stroke={GARIS}
              allowDecimals={false}
              domain={kosong ? [0, 4] : [0, "auto"]}
            />
            {!kosong && (
              <Tooltip formatter={(nilai) => [`${nilai} laporan`, "Masuk"]} />
            )}
            <Line
              type="monotone"
              dataKey="jumlah"
              stroke={kosong ? GARIS : AKSEN}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Bingkai>

      {kosong && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-xl border border-line bg-surface/95 px-4 py-3 text-center">
            <p className="text-base font-semibold leading-tight text-ink">
              Belum ada laporan masuk
            </p>
            <p className="mt-1 max-w-[36ch] text-pretty text-sm leading-normal text-ink-muted">
              Begitu warga mengirim laporan tarif, garis ini menunjukkan
              jumlahnya per hari selama 14 hari terakhir.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
