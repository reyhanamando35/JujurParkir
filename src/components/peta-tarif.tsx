"use client";

import "leaflet/dist/leaflet.css";
// Hanya MarkerCluster.css, bukan MarkerCluster.Default.css: yang ini berisi
// transisi gugus dan kaki laba-laba yang memang dibutuhkan, sedangkan yang
// Default berisi gaya lingkaran hijau-kuning bawaan yang kita ganti sendiri
// dengan token warna proyek.
import "leaflet.markercluster/dist/MarkerCluster.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

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

/** Tampilan awal dan kurungan geografis. Data kita hanya ada di Surabaya. */
const PUSAT_AWAL = [-7.2756, 112.7378] as const;
const ZOOM_AWAL = 12;
const ZOOM_MIN = 11;
const ZOOM_MAKS = 18;
const BATAS_SURABAYA = [
  [-7.4, 112.55],
  [-7.15, 112.88],
] as const;

/**
 * Di atas z15 tidak ada data di berkas tile. Tanpa maxDataZoom, Leaflet meminta
 * z16+ yang tidak ada dan peta berubah kosong tepat saat pengguna memperbesar
 * untuk membaca nama jalan — persis saat peta paling dibutuhkan.
 */
const ZOOM_DATA_MAKS = 15;

/** Sama alasannya dengan latar partikel: DPR 3 membakar fill rate tanpa hasil. */
const DPR_MAKS = 2;

const SUMBER_TITIK = "/data/titik-parkir.geojson";

type Presisi = "jalan" | "perkiraan";

type SifatTitik = {
  alamat: string;
  lokasi: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  jam_teks: string;
  presisi: Presisi;
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

function isiPopup(sifat: SifatTitik): string {
  const catatanPresisi =
    sifat.presisi === "jalan"
      ? `<p class="popup-titik__catatan">Posisi pin adalah perkiraan tengah ruas jalan, bukan titik persis.</p>`
      : "";

  const lokasi =
    sifat.lokasi.length > 0
      ? `<p class="popup-titik__lokasi">${lolos(sifat.lokasi)}</p>`
      : "";

  // Tarif TIDAK pernah diisi angka. Perda tidak memetakan alamat ke kategori
  // tarif, jadi angka apa pun di sini adalah karangan — dan justru angka itulah
  // yang akan dipakai warga untuk berdebat dengan jukir.
  return `
    <div class="popup-titik">
      <h2 class="popup-titik__alamat">${lolos(sifat.alamat)}</h2>
      ${lokasi}
      <dl class="popup-titik__rincian">
        <dt>Jam jaga</dt>
        <dd>${tulisJam(sifat)}</dd>
        <dt>Tarif</dt>
        <dd>Tarif resmi belum diverifikasi</dd>
      </dl>
      ${catatanPresisi}
    </div>
  `;
}

export function PetaTarif() {
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const petaRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<Status>("memuat");
  const [statusTitik, setStatusTitik] = useState<Status>("memuat");
  const [jumlahTitik, setJumlahTitik] = useState(0);
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);

  useEffect(() => {
    const wadah = wadahRef.current;
    if (!wadah) return;

    let peta: LeafletMap | null = null;
    let penandaLokasi: CircleMarker | null = null;
    let pengamatUkuran: ResizeObserver | null = null;
    // Impor modulnya asinkron, jadi efek ini bisa dibersihkan sebelum petanya
    // sempat dibuat. Tanpa penjaga ini, StrictMode di `next dev` meninggalkan
    // satu peta yatim yang tidak pernah di-remove.
    let dibatalkan = false;
    const pembatal = new AbortController();

    const pasang = async () => {
      // Leaflet menyentuh `window` saat modul dievaluasi, jadi ia hanya boleh
      // dimuat di sini — bukan lewat impor statis yang ikut dievaluasi SSR.
      // Urutannya penting: dua modul berikutnya bergantung pada `L` global yang
      // dipasang Leaflet sendiri saat diimpor.
      await import("leaflet");
      const { leafletLayer } = await import("protomaps-leaflet");
      await import("leaflet.markercluster");
      if (dibatalkan || !wadahRef.current) return;

      /**
       * Sengaja mengambil `window.L`, bukan hasil `await import("leaflet")`.
       *
       * Plugin Leaflet gaya lama menempelkan dirinya ke objek global —
       * markercluster menambahkan L.markerClusterGroup ke sana. Di bawah
       * bundler, namespace modul hasil import adalah objek yang BERBEDA dari
       * window.L, dan namespace itu tidak ikut kebagian tambahan si plugin:
       * memanggilnya lewat namespace melempar "L.markerClusterGroup is not a
       * function" padahal plugin-nya jelas sudah termuat. Memakai satu objek
       * yang sama untuk inti dan plugin menutup seluruh kelas bug ini.
       */
      const L = (window as unknown as { L: typeof import("leaflet") }).L;

      const hematGerak = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      peta = L.map(wadahRef.current, {
        // Penanda titik parkir berjumlah ribuan. Canvas menggambarnya sebagai
        // piksel, bukan ribuan elemen DOM yang harus di-layout.
        preferCanvas: true,
        // Kontrol bawaan diganti tombol sendiri supaya ukuran sentuhnya 44px
        // dan posisinya terjangkau ibu jari.
        zoomControl: false,
        center: [PUSAT_AWAL[0], PUSAT_AWAL[1]],
        zoom: ZOOM_AWAL,
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAKS,
        maxBounds: [
          [BATAS_SURABAYA[0][0], BATAS_SURABAYA[0][1]],
          [BATAS_SURABAYA[1][0], BATAS_SURABAYA[1][1]],
        ],
        // Geseran keluar kota ditarik balik penuh: di luar bounds tidak ada
        // titik parkir sama sekali, dan layar kosong terbaca sebagai aplikasi
        // rusak.
        maxBoundsViscosity: 1,
        // Tanpa ini, cubitan dua jari memantul melewati batas zoom dan sekejap
        // memperlihatkan daerah tanpa tile di tepi.
        bounceAtZoomLimits: false,
        zoomAnimation: !hematGerak,
        fadeAnimation: !hematGerak,
        markerZoomAnimation: !hematGerak,
      });

      const lapisan = leafletLayer({
        url: "/tiles/surabaya.pmtiles",
        // Tema terang, sejalan dengan keputusan di globals.css: penggunanya
        // membaca layar di bawah matahari.
        flavor: "light",
        maxDataZoom: ZOOM_DATA_MAKS,
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, DPR_MAKS),
      });

      lapisan.on("tileerror", () => {
        if (!dibatalkan) setStatus("gagal");
      });

      lapisan.addTo(peta);

      /**
       * Penjaga tepi kosong.
       *
       * ZOOM_MIN dan ZOOM_AWAL di atas pas untuk layar ponsel — di 375px,
       * z12 memang membuat kotak Surabaya mengisi layar penuh. Tapi di jendela
       * desktop yang lebar, zoom yang sama membuat viewport lebih luas daripada
       * kotaknya, dan tepi layar terisi daerah putih di luar cakupan berkas
       * tile. getBoundsZoom(batas, true) menjawab "zoom terkecil yang masih
       * membuat layar seluruhnya berada DI DALAM kotak", jadi angka di atas
       * tetap dipakai apa adanya kecuali ketika ia akan memunculkan tepi
       * kosong.
       */
      const kotakTampilan = L.latLngBounds(
        [BATAS_SURABAYA[0][0], BATAS_SURABAYA[0][1]],
        [BATAS_SURABAYA[1][0], BATAS_SURABAYA[1][1]],
      );
      const setelBatasZoomKeluar = () => {
        if (!peta) return;
        peta.setMinZoom(Math.max(ZOOM_MIN, peta.getBoundsZoom(kotakTampilan, true)));
      };
      /**
       * ResizeObserver, bukan event 'resize' milik Leaflet.
       *
       * Saat efek ini berjalan, kontainer peta kadang belum punya ukuran sama
       * sekali (0x0) karena layout browser belum sempat jalan. Menghitung batas
       * zoom pada saat itu menghasilkan angka yang salah, dan Leaflet juga
       * meminta tile untuk kotak yang salah sehingga peta sempat tergambar
       * hanya di sekolom sempit. ResizeObserver menyala tepat ketika ukuran
       * sesungguhnya sudah ada — dan sekaligus menangani rotasi layar, bilah
       * alamat ponsel yang menyusut, dan jendela desktop yang diseret.
       */
      pengamatUkuran = new ResizeObserver(() => {
        if (!peta) return;
        peta.invalidateSize();
        setelBatasZoomKeluar();
        if (peta.getZoom() < peta.getMinZoom()) {
          peta.setZoom(peta.getMinZoom(), { animate: false });
        }
      });
      pengamatUkuran.observe(wadahRef.current);

      // Atribusi OSM wajib tampil (lisensi ODbL), tapi tempat bawaannya
      // kanan-bawah — tepat di bawah tombol zoom. Dipindah, bukan disembunyikan.
      peta.attributionControl.setPosition("bottomleft");

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
        iconCreateFunction: (kelompok) =>
          L.divIcon({
            html: `<span class="gugus-parkir">${kelompok.getChildCount()}</span>`,
            className: "",
            iconSize: [38, 38],
          }),
      });

      // L.Icon bawaan Leaflet menunjuk berkas PNG lewat jalur relatif yang
      // rusak begitu di-bundle Next.js — penandanya diam-diam tidak muncul.
      // divIcon digambar sepenuhnya lewat CSS, jadi tidak ada berkas gambar
      // yang bisa hilang.
      const ikonTitik = L.divIcon({
        html: '<span class="pin-parkir"></span>',
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
      });

      for (const fitur of data.features) {
        const [lng, lat] = fitur.geometry.coordinates;
        const penanda = L.marker([lat, lng], {
          icon: ikonTitik,
          keyboard: false,
          alt: `Titik parkir ${fitur.properties.alamat}`,
        });
        penanda.bindPopup(isiPopup(fitur.properties), {
          closeButton: true,
          maxWidth: 280,
          autoPanPadding: [16, 16],
        });
        gugus.addLayer(penanda);
      }

      gugus.addTo(peta);
      setJumlahTitik(data.features.length);
      setStatusTitik("siap");
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
      pengamatUkuran?.disconnect();
      pengamatUkuran = null;
      penandaLokasi?.remove();
      penandaLokasi = null;
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

      {/* Dibaca pembaca layar sebagai pengganti isi peta yang berupa canvas. */}
      <p className="sr-only" role="status">
        {statusTitik === "siap"
          ? `${jumlahTitik} titik parkir resmi ditampilkan di peta.`
          : ""}
      </p>
    </div>
  );
}
