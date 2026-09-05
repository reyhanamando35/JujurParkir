"use client";

import "leaflet/dist/leaflet.css";
// Hanya MarkerCluster.css, bukan MarkerCluster.Default.css: yang ini berisi
// transisi gugus dan kaki laba-laba yang memang dibutuhkan, sedangkan yang
// Default berisi gaya lingkaran hijau-kuning bawaan yang kita ganti sendiri
// dengan token warna proyek.
import "leaflet.markercluster/dist/MarkerCluster.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap, Marker } from "leaflet";

import {
  LaporWarga,
  type Sasaran,
  type Terdekat,
  type Terkirim,
  type TitikRingkas,
} from "@/components/lapor-warga";
import { pasangPetaDasar, SUMBER_TITIK } from "@/lib/peta-dasar";
import { createClient } from "@/lib/supabase/client";
import { NAMA_KENDARAAN, SUMBER_TARIF, teksRentang } from "@/lib/tarif";
import { turunkanWilayah, WILAYAH } from "@/lib/wilayah-titik";

/**
 * Peta dasar Surabaya dari public/tiles/surabaya.pmtiles, ditumpangi 1.235
 * titik parkir resmi dari public/data/titik-parkir.geojson.
 *
 * Berkas tile-nya vector tiles (MVT), bukan raster, jadi Leaflet polos tidak
 * bisa menggambarnya — perendernya protomaps-leaflet, yang menggambar geometri
 * ke Canvas 2D. Dipilih di atas MapLibre karena labelnya memakai font sistem:
 * tidak ada berkas glyph yang harus diunduh, jadi peta ini benar-benar jalan
 * tanpa internet.
 *
 * Titik parkir dibaca dari berkas statis, bukan lewat Supabase, supaya ikut
 * ter-cache peramban dan tetap tampil saat jaringan mati.
 */

// Tampilan awal, kurungan geografis, dan pemasangan peta dasar dipakai bersama
// dengan peta verifikasi petugas — lihat src/lib/peta-dasar.ts.

type Presisi = "jalan" | "perkiraan";

type SifatTitik = {
  alamat: string;
  lokasi: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  jam_teks: string;
  presisi: Presisi;
  wilayah: string;
};

type FiturTitik = {
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SifatTitik;
};

type Status = "memuat" | "siap" | "gagal";

const kelasTombol = [
  "flex size-11 items-center justify-center rounded-xl border border-line",
  "bg-surface text-ink shadow-sm transition-colors duration-150 ease-out",
  "hover:border-accent hover:bg-surface-2",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  "disabled:opacity-50 motion-reduce:transition-none",
].join(" ");

/**
 * Isi popup dirakit sebagai HTML, dan teksnya berasal dari CSV hasil scraping —
 * bukan sumber tepercaya. Tanpa peloloskan ini, satu alamat yang kebetulan
 * mengandung tanda kurung siku sudah cukup untuk menyuntik markup.
 */
function lolos(teks: string): string {
  return teks
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tulisJam(sifat: SifatTitik): string {
  if (sifat.jam_mulai !== null && sifat.jam_selesai !== null) {
    return `${sifat.jam_mulai}–${sifat.jam_selesai}`;
  }
  // Jam yang tidak bisa diparse ditampilkan apa adanya, disertai keterangan.
  // Menyembunyikannya berarti menghilangkan satu-satunya petunjuk yang ada.
  if (sifat.jam_teks.length > 0) {
    return `${lolos(sifat.jam_teks)} <span class="popup-titik__ragu">(format aslinya belum terbaca)</span>`;
  }
  return "Tidak tercatat";
}

function isiPopup(
  sifat: SifatTitik,
  kode: string,
  jumlahLaporan: number | null,
): string {
  const catatanPresisi =
    sifat.presisi === "jalan"
      ? `<p class="popup-titik__catatan">Posisi pin adalah perkiraan tengah ruas jalan, bukan titik persis.</p>`
      : "";

  const lokasi =
    sifat.lokasi.length > 0
      ? `<p class="popup-titik__lokasi">${lolos(sifat.lokasi)}</p>`
      : "";

  // RENTANG lintas seluruh kategori, tidak pernah satu angka untuk titik ini.
  // Kategori tarif tiap titik memang belum diketahui, jadi satu angka tunggal
  // akan terbaca sebagai "tarif resmi di sini" — persis klaim yang tidak bisa
  // kita pertanggungjawabkan.
  // Tiga keadaan yang berbeda, dan ketiganya harus dibedakan:
  //
  //   null — angkanya belum termuat (jaringan lambat/mati). BUKAN nol, jadi
  //          tidak boleh ditampilkan sebagai nol dan tidak boleh disembunyikan:
  //          diam berarti "tidak ada laporan", dan itu klaim yang belum tentu
  //          benar.
  //   0    — sudah termuat dan memang belum ada laporan. Barisnya dihilangkan
  //          sama sekali; menulis "0 laporan" di 1.235 titik hanya menenggelamkan
  //          titik yang benar-benar punya laporan.
  //   >0   — angkanya disebut, dan kalimat "belum diverifikasi" WAJIB ikut:
  //          laporan warga adalah keterangan sepihak, dan angka telanjang di
  //          sebelah sebuah titik akan terbaca sebagai vonis untuk jukir yang
  //          menjaganya.
  const baris =
    jumlahLaporan === null
      ? `<p class="popup-titik__laporan">Jumlah laporan belum termuat.</p>`
      : jumlahLaporan === 0
        ? ""
        : `<p class="popup-titik__laporan"><strong>${jumlahLaporan} laporan warga</strong> dalam 30 hari terakhir, belum diverifikasi petugas.</p>`;

  const sumber = SUMBER_TARIF.resmi
    ? `<p class="popup-titik__sumber">Sumber: ${lolos(SUMBER_TARIF.rujukan)}</p>`
    : `<p class="popup-titik__contoh">Angka contoh, belum diisi dari Perda 7/2023 — jangan dipakai sebagai rujukan resmi.</p>`;

  return `
    <div class="popup-titik">
      <h2 class="popup-titik__alamat">${lolos(sifat.alamat)}</h2>
      ${lokasi}
      <dl class="popup-titik__rincian">
        <dt>Jam jaga</dt>
        <dd>${tulisJam(sifat)}</dd>
        <dt>${NAMA_KENDARAAN.motor}</dt>
        <dd>${teksRentang("motor")}</dd>
        <dt>${NAMA_KENDARAAN.mobil}</dt>
        <dd>${teksRentang("mobil")}</dd>
      </dl>
      <p class="popup-titik__catatan">Kategori tarif titik ini belum diverifikasi, jadi yang bisa dipastikan hanya rentangnya. Pungutan di atas batas tertinggi berarti di luar ketentuan.</p>
      ${sumber}
      ${baris}
      ${catatanPresisi}
      <button type="button" class="popup-titik__lapor" data-kode="${lolos(kode)}">Laporkan titik ini</button>
    </div>
  `;
}

/**
 * Jarak haversine dalam meter.
 *
 * Dihitung di klien dari GeoJSON yang sudah dimuat, bukan lewat PostGIS:
 * hasilnya seketika dan tetap benar saat jaringan mati — dua hal yang penting
 * buat orang yang sedang berdiri di pinggir jalan.
 */
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

function keRingkas(f: FiturTitik): TitikRingkas {
  return {
    kode: f.id,
    alamat: f.properties.alamat,
    lokasi: f.properties.lokasi,
    wilayah: f.properties.wilayah,
  };
}

/**
 * Radius maksimum sebuah titik resmi boleh ditawarkan sebagai "mungkin ini yang
 * kamu maksud".
 *
 * Tanpa ambang, tiga titik terdekat SELALU muncul betapapun jauhnya — pernah
 * menawarkan titik 159 m dari pin, yang jelas bukan tempat yang dimaksud
 * pelapor. 100 m masih memaklumi koordinat yang ditandai di tengah ruas jalan,
 * tapi tidak lagi menawarkan titik dari blok sebelah.
 */
const RADIUS_TAWARAN_M = 100;

function cariTerdekat(
  fitur: FiturTitik[],
  lat: number,
  lng: number,
  jumlah = 3,
): Terdekat[] {
  return fitur
    .map((f) => ({
      titik: keRingkas(f),
      jarak: jarakMeter(lat, lng, f.geometry.coordinates[1], f.geometry.coordinates[0]),
    }))
    .filter((d) => d.jarak <= RADIUS_TAWARAN_M)
    .sort((a, b) => a.jarak - b.jarak)
    .slice(0, jumlah);
}

export function PetaTarif() {
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const petaRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<Status>("memuat");
  const [statusTitik, setStatusTitik] = useState<Status>("memuat");
  const [jumlahTitik, setJumlahTitik] = useState(0);
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);
  const [sasaran, setSasaran] = useState<Sasaran | null>(null);
  const fiturRef = useRef<FiturTitik[]>([]);
  /**
   * Jumlah laporan per titik. `null` selama belum termuat — dibedakan dari
   * Map kosong, yang berarti sudah termuat dan memang nol.
   */
  const agregatRef = useRef<Map<string, number> | null>(null);
  /** Gugus dan penandanya disimpan supaya ikonnya bisa disegarkan saat angka laporan tiba. */
  const gugusRef = useRef<{ refreshClusters: () => void } | null>(null);
  const penandaRef = useRef<Array<{ kode: string; penanda: Marker }>>([]);
  const [agregatVersi, setAgregatVersi] = useState(0);
  /**
   * Jumlah yang terakhir benar-benar dipasang ke ikon tiap penanda.
   *
   * Dipakai supaya penyegaran hanya menyentuh penanda yang angkanya berubah.
   * Tanpa ini, tiap pemuatan ulang agregat berarti 1.235 setIcon — dan penanda
   * yang angkanya turun kembali ke nol tidak akan pernah dikecilkan lagi.
   */
  const terpasangRef = useRef<Map<string, number>>(new Map());
  /** Jumlah laporan lokasi tak terdaftar per wilayah, untuk pil di atas peta. */
  const [agregatWilayah, setAgregatWilayah] = useState<Map<
    string,
    number
  > | null>(null);
  const pinRef = useRef<Marker | null>(null);

  /**
   * Jumlah laporan diambil DARI PERAMBAN, bukan dari Server Component.
   *
   * /warga adalah halaman statis. Menaruh query Supabase di server membuatnya
   * dinamis, dan peta yang seharusnya bisa dibuka tanpa internet jadi butuh
   * jaringan hanya untuk dirender. Dengan cara ini, peta dan 1.235 titiknya
   * tetap tampil penuh saat jaringan mati — hanya angkanya yang tidak muncul.
   *
   * View laporan_agregat_titik sengaja dibuat security_invoker = false di
   * basis data, jadi kunci anon bisa membaca angkanya tanpa pernah bisa
   * membaca satu baris laporan pun.
   */
  const muatAgregat = useCallback(async () => {
    await Promise.all([
      (async () => {
        const { data, error } = await createClient()
          .from("laporan_agregat_titik")
          .select("titik_kode, jumlah");

        if (error) {
          console.error("[peta-tarif] gagal memuat jumlah laporan:", error);
          return;
        }

        // Satu titik bisa punya beberapa baris (satu per jenis laporan), jadi
        // dijumlahkan dulu.
        const total = new Map<string, number>();
        for (const baris of data ?? []) {
          const kode = baris.titik_kode as string | null;
          if (!kode) continue;
          total.set(kode, (total.get(kode) ?? 0) + Number(baris.jumlah ?? 0));
        }
        agregatRef.current = total;
        setAgregatVersi((v) => v + 1);
      })(),

      (async () => {
        const { data, error } = await createClient()
          .from("laporan_agregat_wilayah")
          .select("bagian_kota, jumlah");

        if (error) {
          console.error("[peta-tarif] gagal memuat agregat wilayah:", error);
          return;
        }

        const total = new Map<string, number>();
        for (const baris of data ?? []) {
          const wilayah = baris.bagian_kota as string | null;
          if (!wilayah) continue;
          total.set(
            wilayah,
            (total.get(wilayah) ?? 0) + Number(baris.jumlah ?? 0),
          );
        }
        setAgregatWilayah(total);
      })(),
    ]);
  }, []);

  useEffect(() => {
    void muatAgregat();
  }, [muatAgregat]);

  /**
   * Pil jumlah laporan per wilayah, digambar DI ATAS PETA.
   *
   * Sengaja dibuat sangat berbeda dari lingkaran gugus. Keduanya menghitung
   * laporan, tapi laporan yang berbeda: lingkaran gugus menghitung laporan di
   * TITIK PARKIR RESMI, pil ini menghitung laporan di LOKASI YANG TIDAK
   * TERDAFTAR. Dua angka yang artinya berbeda tidak boleh tampil dengan bentuk
   * yang mirip — makanya yang satu lingkaran dan yang satu persegi membulat
   * yang selalu membawa kata "laporan".
   *
   * interactive: false — pil ini tidak boleh menelan ketukan peta, karena
   * ketukan itulah yang memulai alur pelaporan lokasi tidak terdaftar.
   */
  useEffect(() => {
    const peta = petaRef.current;
    if (!peta || agregatWilayah === null || statusTitik !== "siap") return;

    const L = (window as unknown as { L?: typeof import("leaflet") }).L;
    if (!L) return;

    // Titik tengah tiap wilayah dihitung dari titik parkir yang benar-benar ada
    // di sana, bukan koordinat yang ditulis tangan — jadi pilnya selalu jatuh
    // di dalam wilayahnya sendiri.
    const rerata = new Map<string, { lat: number; lng: number; n: number }>();
    for (const f of fiturRef.current) {
      const w = f.properties.wilayah;
      const a = rerata.get(w) ?? { lat: 0, lng: 0, n: 0 };
      a.lat += f.geometry.coordinates[1];
      a.lng += f.geometry.coordinates[0];
      a.n += 1;
      rerata.set(w, a);
    }

    const penanda: Marker[] = [];
    for (const wilayah of WILAYAH) {
      const titik = rerata.get(wilayah);
      if (!titik || titik.n === 0) continue;
      const jumlah = agregatWilayah.get(wilayah) ?? 0;
      // Wilayah tanpa laporan tidak diberi pil sama sekali. "Pusat · 0 laporan"
      // tidak memberi tahu apa pun yang berguna, dan lima pil nol menutupi peta
      // di zoom yang justru dipakai untuk melihat sebarannya.
      if (jumlah === 0) continue;

      const m = L.marker([titik.lat / titik.n, titik.lng / titik.n], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<span class="pil-wilayah pil-wilayah--ada">${wilayah} · ${jumlah} laporan</span>`,
        }),
      });
      m.addTo(peta);
      penanda.push(m);
    }

    // Di zoom dekat, pengelompokan wilayah kehilangan arti dan pilnya hanya
    // menutupi jalan yang sedang dilihat orang.
    const aturTampak = () => {
      const tampil = peta.getZoom() <= 13;
      for (const m of penanda) {
        const el = m.getElement();
        if (el) el.style.display = tampil ? "" : "none";
      }
    };
    aturTampak();
    peta.on("zoomend", aturTampak);

    return () => {
      peta.off("zoomend", aturTampak);
      for (const m of penanda) m.remove();
    };
  }, [agregatWilayah, statusTitik]);

  /**
   * Angka laporan hampir selalu tiba setelah 1.235 penanda selesai dipasang,
   * jadi ikonnya harus disegarkan — kalau tidak, seluruh peta akan membeku
   * menampilkan titik kecil padahal datanya sudah ada.
   *
   * Efek ini berjalan lagi tiap agregat dimuat ulang (termasuk setelah warga
   * mengirim laporan), jadi dua hal penting:
   *
   *   - Hanya penanda yang angkanya BERUBAH yang disentuh. Tanpa pembanding,
   *     tiap penyegaran berarti 1.235 setIcon.
   *   - Angka bisa TURUN, bukan cuma naik: laporan bisa keluar dari jendela 30
   *     hari atau ditandai 'ditolak' oleh petugas. Penanda yang kembali nol
   *     harus dikecilkan lagi, bukan dibiarkan menyandang angka basi.
   */
  useEffect(() => {
    if (agregatVersi === 0 || statusTitik !== "siap") return;
    const L = (window as unknown as { L?: typeof import("leaflet") }).L;
    if (!L) return;

    let adaPerubahan = false;
    for (const { kode, penanda } of penandaRef.current) {
      const jumlah = agregatRef.current?.get(kode) ?? 0;
      if (terpasangRef.current.get(kode) === jumlah) continue;

      penanda.setIcon(
        jumlah > 0
          ? L.divIcon({
              html: `<span class="pin-parkir pin-parkir--lapor">${jumlah}</span>`,
              className: "",
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12],
            })
          : L.divIcon({
              html: '<span class="pin-parkir"></span>',
              className: "",
              iconSize: [16, 16],
              iconAnchor: [8, 8],
              popupAnchor: [0, -8],
            }),
      );
      terpasangRef.current.set(kode, jumlah);
      adaPerubahan = true;
    }

    // refreshClusters menggambar ulang seluruh lingkaran gugus; tidak perlu
    // dijalankan kalau tidak ada satu pun angka yang berubah.
    if (adaPerubahan) gugusRef.current?.refreshClusters();
  }, [agregatVersi, statusTitik]);

  const tutupLapor = useCallback(() => {
    pinRef.current?.remove();
    pinRef.current = null;
    setSasaran(null);
  }, []);

  /**
   * Dipanggil begitu sebuah laporan benar-benar tersimpan.
   *
   * Angkanya dinaikkan lebih dulu di sini, baru agregatnya dimuat ulang dari
   * basis data. Urutan itu disengaja: warga melihat angkanya bergerak pada
   * detik yang sama ia menekan kirim, bukan setelah satu putaran jaringan lagi
   * — dan orang yang baru saja melapor di pinggir jalan memang butuh bukti
   * bahwa laporannya masuk hitungan.
   *
   * Kalau pemuatan ulangnya gagal, kenaikan tadi tetap bertahan. Itu perilaku
   * yang benar: laporannya memang sudah tersimpan.
   */
  const catatLaporanBaru = useCallback(
    (info: Terkirim) => {
      if (info.jalur === "terdaftar") {
        const peta = agregatRef.current ?? new Map<string, number>();
        peta.set(info.kode, (peta.get(info.kode) ?? 0) + 1);
        agregatRef.current = peta;
        setAgregatVersi((v) => v + 1);
      } else {
        // Fungsi yang sama persis dengan yang dipakai Server Action, jadi
        // wilayah tebakan di sini tidak akan meleset dari yang dihitung server.
        const wilayah = turunkanWilayah(info.lat, info.lng);
        setAgregatWilayah((sebelumnya) => {
          const peta = new Map(sebelumnya ?? []);
          peta.set(wilayah, (peta.get(wilayah) ?? 0) + 1);
          return peta;
        });
      }

      void muatAgregat();
    },
    [muatAgregat],
  );

  useEffect(() => {
    const wadah = wadahRef.current;
    if (!wadah) return;

    let peta: LeafletMap | null = null;
    let penandaLokasi: CircleMarker | null = null;
    let lepasPengamat: (() => void) | null = null;
    // Impor modulnya asinkron, jadi efek ini bisa dibersihkan sebelum petanya
    // sempat dibuat. Tanpa penjaga ini, StrictMode di `next dev` meninggalkan
    // satu peta yatim yang tidak pernah di-remove.
    let dibatalkan = false;
    const pembatal = new AbortController();

    const pasang = async () => {
      // Seluruh pemasangan peta dasar — impor Leaflet, lapisan PMTiles, batas
      // zoom, ResizeObserver — ada di src/lib/peta-dasar.ts karena peta
      // verifikasi petugas memakai yang persis sama.
      const dasar = await pasangPetaDasar(wadah, {
        onTileError: () => {
          if (!dibatalkan) setStatus("gagal");
        },
        batal: () => dibatalkan || !wadahRef.current,
      });
      // null berarti komponennya sudah dilepas selama impor berlangsung, dan
      // tidak ada peta yang dibuat sama sekali.
      if (!dasar) return;

      const L = dasar.L;
      peta = dasar.peta;
      lepasPengamat = dasar.bersihkan;

      peta.on("locationfound", (event) => {
        if (!peta) return;
        setPesanLokasi(null);
        penandaLokasi?.remove();
        penandaLokasi = L.circleMarker(event.latlng, {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
        }).addTo(peta);
      });

      peta.on("locationerror", () => {
        setPesanLokasi(
          "Lokasi tidak bisa diambil. Periksa izin lokasi di peramban.",
        );
      });

      petaRef.current = peta;
      setStatus("siap");

      // --- Titik parkir --------------------------------------------------
      let data: { features: FiturTitik[] };
      try {
        const jawaban = await fetch(SUMBER_TITIK, { signal: pembatal.signal });
        if (!jawaban.ok) throw new Error(`HTTP ${jawaban.status}`);
        data = await jawaban.json();
      } catch (galat) {
        if (!dibatalkan && (galat as Error).name !== "AbortError") {
          setStatusTitik("gagal");
        }
        return;
      }
      if (dibatalkan || !peta) return;

      const gugus = L.markerClusterGroup({
        // 1.235 penanda sekaligus membekukan utas utama di HP kelas menengah.
        // chunkedLoading memecahnya jadi potongan supaya layar tetap responsif.
        chunkedLoading: true,
        // Poligon jangkauan saat hover tidak berguna di layar sentuh dan hanya
        // menambah gambar yang berkedip.
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        // Wajib untuk data ini: 16 alamat Baliwerti berbagi satu koordinat
        // yang sama persis. Tanpa spiderfy, 15 di antaranya tertimbun dan tidak
        // akan pernah bisa diketuk.
        spiderfyOnMaxZoom: true,
        // Angka di lingkaran gugus adalah JUMLAH LAPORAN warga dari seluruh
        // titik parkir di dalamnya — bukan jumlah titiknya. Itu angka yang
        // dicari orang saat membuka peta transparansi; jumlah titiknya sendiri
        // tetap bisa dilihat lewat title saat disorot.
        iconCreateFunction: (kelompok) => {
          const anak = kelompok.getAllChildMarkers();
          const total = anak.reduce(
            (n, m) =>
              n +
              (agregatRef.current?.get(
                (m as unknown as { __kode?: string }).__kode ?? "",
              ) ?? 0),
            0,
          );
          // Gugus tanpa laporan tidak menampilkan angka apa pun dan dibuat
          // lebih kecil. Sebelumnya hampir seluruh peta berisi lingkaran "0",
          // dan lautan nol itu justru menyembunyikan segelintir titik yang
          // benar-benar punya laporan — kebalikan dari guna peta ini.
          //
          // Jumlah titiknya sengaja TIDAK dipakai sebagai angka pengganti:
          // satu bentuk lingkaran yang angkanya berarti "laporan" saat beraksen
          // tapi "titik parkir" saat abu adalah persis dua angka berbeda arti
          // dengan bentuk mirip. Itu tetap tersedia lewat title saat disorot.
          return total > 0
            ? L.divIcon({
                html: `<span class="gugus-parkir gugus-parkir--lapor" title="${total} laporan warga dari ${anak.length} titik parkir di area ini">${total}</span>`,
                className: "",
                iconSize: [38, 38],
              })
            : L.divIcon({
                html: `<span class="gugus-parkir gugus-parkir--kosong" title="${anak.length} titik parkir di area ini, belum ada laporan"></span>`,
                className: "",
                iconSize: [28, 28],
              });
        },
      });

      // L.Icon bawaan Leaflet menunjuk berkas PNG lewat jalur relatif yang
      // rusak begitu di-bundle Next.js — penandanya diam-diam tidak muncul.
      // divIcon digambar sepenuhnya lewat CSS, jadi tidak ada berkas gambar
      // yang bisa hilang.
      // Titik yang punya laporan membesar dan menunjukkan angkanya; yang belum
      // pernah dilaporkan tetap titik kecil. Angka "0" di lingkaran 16px tidak
      // terbaca, dan 1.235 titik yang semuanya berlabel nol akan menutupi peta
      // itu sendiri — angkanya tetap disebut apa adanya di dalam popup.
      const buatIkonTitik = (jumlah: number) =>
        jumlah > 0
          ? L.divIcon({
              html: `<span class="pin-parkir pin-parkir--lapor">${jumlah}</span>`,
              className: "",
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12],
            })
          : L.divIcon({
              html: '<span class="pin-parkir"></span>',
              className: "",
              iconSize: [16, 16],
              iconAnchor: [8, 8],
              popupAnchor: [0, -8],
            });

      const daftarPenanda: Array<{ kode: string; penanda: Marker }> = [];
      // Dicatat sejak ikon pertama dipasang, supaya penyegaran berikutnya tahu
      // penanda mana yang sudah benar dan tidak perlu disentuh lagi.
      terpasangRef.current = new Map();
      for (const fitur of data.features) {
        const [lng, lat] = fitur.geometry.coordinates;
        const jumlahAwal = agregatRef.current?.get(fitur.id) ?? 0;
        terpasangRef.current.set(fitur.id, jumlahAwal);
        const penanda = L.marker([lat, lng], {
          icon: buatIkonTitik(jumlahAwal),
          keyboard: false,
          alt: `Titik parkir ${fitur.properties.alamat}`,
        });
        // Fungsi, bukan string: Leaflet memanggilnya setiap popup dibuka, jadi
        // jumlah laporan yang tiba setelah fetch selesai langsung ikut tampil
        // tanpa perlu membangun ulang 1.235 penanda.
        penanda.bindPopup(
          () =>
            isiPopup(
              fitur.properties,
              fitur.id,
              agregatRef.current?.get(fitur.id) ?? (agregatRef.current ? 0 : null),
            ),
          {
            closeButton: true,
            maxWidth: 280,
            autoPanPadding: [16, 16],
          },
        );
        // Dipakai iconCreateFunction untuk menjumlahkan laporan seluruh anak gugus.
        (penanda as unknown as { __kode: string }).__kode = fitur.id;
        daftarPenanda.push({ kode: fitur.id, penanda });
        gugus.addLayer(penanda);
      }
      penandaRef.current = daftarPenanda;
      gugusRef.current = gugus as unknown as { refreshClusters: () => void };

      gugus.addTo(peta);
      fiturRef.current = data.features;
      setJumlahTitik(data.features.length);
      setStatusTitik("siap");

      // --- Jalur A: tombol di dalam popup ---------------------------------
      // Di-wire lewat popupopen, bukan onclick inline di string HTML: atribut
      // onclick hanya bisa memanggil fungsi global, dan itu berarti membocorkan
      // penangan React ke window.
      peta.on("popupopen", (peristiwa) => {
        const tombol = peristiwa.popup
          .getElement()
          ?.querySelector<HTMLButtonElement>(".popup-titik__lapor");
        if (!tombol) return;
        tombol.onclick = () => {
          const fitur = fiturRef.current.find((f) => f.id === tombol.dataset.kode);
          if (!fitur) return;
          peta?.closePopup();
          setSasaran({ mode: "titik", titik: keRingkas(fitur) });
        };
      });

      // --- Jalur B: ketuk area kosong -------------------------------------
      const ikonPinSementara = L.divIcon({
        html: '<span class="pin-sementara"></span>',
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const perbaruiPilihan = (lat: number, lng: number) => {
        setSasaran({
          mode: "pilih",
          lat,
          lng,
          terdekat: cariTerdekat(fiturRef.current, lat, lng),
        });
      };

      peta.on("click", (peristiwa) => {
        if (!peta) return;
        const { lat, lng } = peristiwa.latlng;

        // Ketukan pertama HANYA menaruh pin dan membuka daftar pilihan.
        // Sengaja tidak langsung membuka formulir: banyak koordinat kita cuma
        // perkiraan tengah ruas jalan, jadi sistem tidak boleh memutuskan
        // sendiri bahwa sebuah lokasi "tidak terdaftar". Yang memutuskan adalah
        // orang yang sedang berdiri di sana.
        if (pinRef.current) {
          pinRef.current.setLatLng([lat, lng]);
        } else {
          const pin = L.marker([lat, lng], {
            icon: ikonPinSementara,
            draggable: true,
            keyboard: false,
            alt: "Pin lokasi laporan, bisa digeser",
          });
          pin.on("dragend", () => {
            const posisi = pin.getLatLng();
            perbaruiPilihan(posisi.lat, posisi.lng);
          });
          pin.addTo(peta);
          pinRef.current = pin;
        }
        perbaruiPilihan(lat, lng);
      });
    };

    void pasang().catch((galat: unknown) => {
      if (dibatalkan) return;
      // Galatnya dicetak, bukan ditelan. Peta yang gagal diam-diam adalah
      // kotak abu-abu tanpa petunjuk apa pun buat yang memperbaikinya nanti.
      console.error("[peta-tarif] gagal menyiapkan peta:", galat);
      setStatus("gagal");
    });

    return () => {
      dibatalkan = true;
      pembatal.abort();
      lepasPengamat?.();
      lepasPengamat = null;
      penandaLokasi?.remove();
      penandaLokasi = null;
      pinRef.current?.remove();
      pinRef.current = null;
      // Wajib. Tanpa ini Leaflet melempar "Map container is already
      // initialized" saat StrictMode menjalankan efek dua kali, dan tiap
      // kunjungan ulang ke /warga menyisakan peta lama beserta cache tile-nya
      // di memori.
      peta?.remove();
      peta = null;
      petaRef.current = null;
    };
  }, []);

  const perbesar = useCallback(() => petaRef.current?.zoomIn(), []);
  const perkecil = useCallback(() => petaRef.current?.zoomOut(), []);

  const cariLokasi = useCallback(() => {
    const peta = petaRef.current;
    if (!peta) return;
    setPesanLokasi("Mencari lokasi kamu…");
    peta.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
  }, []);

  return (
    <div className="absolute inset-0">
      <div
        ref={wadahRef}
        // overscroll-none menahan tarik-untuk-menyegarkan supaya gerakan
        // menggeser peta ke bawah tidak memuat ulang halaman.
        className="size-full overscroll-none bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        role="region"
        aria-label="Peta Kota Surabaya berisi titik parkir resmi. Tombol panah menggeser peta, tombol tambah dan kurang mengatur perbesaran."
      />

      {status !== "siap" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-2">
          <p className="rounded-xl bg-surface px-4 py-3 text-base leading-normal text-ink-muted shadow-sm">
            {status === "memuat"
              ? "Memuat peta Surabaya…"
              : "Peta gagal dimuat. Coba muat ulang halaman."}
          </p>
        </div>
      )}

      {/* Indikator titik: muncul hanya selagi berjalan atau kalau gagal. */}
      {status === "siap" && statusTitik !== "siap" && (
        <p
          role="status"
          className="absolute inset-x-3 top-3 z-[1000] rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-normal text-ink shadow-sm"
        >
          {statusTitik === "memuat"
            ? "Memuat titik parkir…"
            : "Titik parkir gagal dimuat. Peta dasar tetap bisa dipakai."}
        </p>
      )}

      {pesanLokasi && (
        <p
          role="status"
          // Di atas, bukan di bawah: sudut bawah sudah dipakai atribusi dan
          // tombol, dan pesan yang menutupi keduanya terbaca seperti kerusakan.
          className="absolute inset-x-3 top-3 z-[1000] rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-normal text-ink shadow-sm"
        >
          {pesanLokasi}
        </p>
      )}

      {/* Kanan-bawah: paling dekat ibu jari saat ponsel dipegang satu tangan. */}
      <div className="absolute bottom-4 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={cariLokasi}
          disabled={status !== "siap"}
          className={kelasTombol}
          aria-label="Tampilkan lokasi saya di peta"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="size-5"
          >
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={perbesar}
          disabled={status !== "siap"}
          className={kelasTombol}
          aria-label="Perbesar peta"
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
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
        </button>
        <button
          type="button"
          onClick={perkecil}
          disabled={status !== "siap"}
          className={kelasTombol}
          aria-label="Perkecil peta"
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
            <path d="M5.5 12h13" />
          </svg>
        </button>
      </div>

      {sasaran && (
        <LaporWarga
          // Ganti key = mount ulang: formulir untuk titik lain harus dimulai
          // bersih, bukan mewarisi isian titik sebelumnya.
          key={sasaran.mode === "titik" ? `titik-${sasaran.titik.kode}` : "pilih"}
          sasaran={sasaran}
          onTutup={tutupLapor}
          onTerkirim={catatLaporanBaru}
        />
      )}

      {/* Dibaca pembaca layar sebagai pengganti isi peta yang berupa canvas. */}
      <p className="sr-only" role="status">
        {statusTitik === "siap"
          ? `${jumlahTitik} titik parkir resmi ditampilkan di peta.`
          : ""}
      </p>
    </div>
  );
}
