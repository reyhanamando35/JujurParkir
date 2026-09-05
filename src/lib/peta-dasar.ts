import type { Map as LeafletMap } from "leaflet";

/**
 * Pemasangan peta dasar Surabaya, dipakai bersama oleh peta warga dan peta
 * verifikasi petugas.
 *
 * Berkas ini bukan abstraksi yang dicari-cari. Isinya sekumpulan keputusan yang
 * mahal ditemukan dan berbahaya kalau menyimpang antara dua peta: urutan impor
 * Leaflet, pemakaian `window.L` alih-alih namespace modul, batas zoom yang
 * mengikuti ukuran layar, dan penjaga tepi kosong. Kalau salah satu peta
 * memakai versi yang berbeda, bug-nya muncul di satu halaman saja dan sangat
 * sulit ditelusuri.
 *
 * Peta dasarnya dari public/tiles/surabaya.pmtiles — vector tiles (MVT), bukan
 * raster, jadi Leaflet polos tidak bisa menggambarnya. Perendernya
 * protomaps-leaflet, yang menggambar geometri ke Canvas 2D dan memakai font
 * sistem untuk label, sehingga tidak ada berkas glyph yang harus diunduh.
 */

/** Tampilan awal dan kurungan geografis. Data kita hanya ada di Surabaya. */
export const PUSAT_AWAL = [-7.2756, 112.7378] as const;
export const ZOOM_AWAL = 12;
export const ZOOM_MIN = 11;
export const ZOOM_MAKS = 18;
export const BATAS_SURABAYA = [
  [-7.4, 112.55],
  [-7.15, 112.88],
] as const;

/**
 * Di atas z15 tidak ada data di berkas tile. Tanpa maxDataZoom, Leaflet meminta
 * z16+ yang tidak ada dan peta berubah kosong tepat saat pengguna memperbesar
 * untuk membaca nama jalan — persis saat peta paling dibutuhkan.
 */
export const ZOOM_DATA_MAKS = 15;

/** Sama alasannya dengan latar partikel: DPR 3 membakar fill rate tanpa hasil. */
export const DPR_MAKS = 2;

export const SUMBER_TITIK = "/data/titik-parkir.geojson";

export type PetaDasar = {
  /** Objek Leaflet global, sudah lengkap dengan plugin. Lihat catatan di bawah. */
  L: typeof import("leaflet");
  peta: LeafletMap;
  /** Melepas ResizeObserver. Pemanggil tetap yang memanggil peta.remove(). */
  bersihkan: () => void;
};

/**
 * Membuat peta, memasang lapisan tile, dan menjaga batas zoomnya.
 *
 * Asinkron karena Leaflet menyentuh `window` saat modulnya dievaluasi — impor
 * statis akan ikut dievaluasi saat SSR dan meledak di server.
 *
 * `opsi.batal` WAJIB diisi pemanggil yang hidup di dalam useEffect. Lihat
 * alasannya di titik pemeriksaannya di bawah.
 */
export async function pasangPetaDasar(
  wadah: HTMLElement,
  opsi: { onTileError?: () => void; batal?: () => boolean } = {},
): Promise<PetaDasar | null> {
  // Urutannya penting: dua modul berikutnya bergantung pada `L` global yang
  // dipasang Leaflet sendiri saat diimpor.
  await import("leaflet");
  const { leafletLayer } = await import("protomaps-leaflet");
  await import("leaflet.markercluster");

  /**
   * Titik batal ini harus ada DI SINI — setelah impor, sebelum L.map().
   *
   * StrictMode di `next dev` menjalankan efek dua kali pada kontainer yang
   * sama. Kedua pemanggil sampai ke baris ini hampir bersamaan karena impornya
   * sudah ter-cache. Kalau petanya dibuat lebih dulu baru pembatalannya
   * diperiksa oleh pemanggil, pemanggil kedua menabrak kontainer yang sudah
   * ter-inisialisasi dan Leaflet melempar "Map container is already
   * initialized" — petanya lalu gagal total, bukan sekadar berkedip.
   *
   * Membersihkan peta yatim setelah terlanjur dibuat TIDAK cukup: yang menang
   * balapan bukan selalu yang seharusnya hidup.
   */
  if (opsi.batal?.()) return null;

  /**
   * Sengaja mengambil `window.L`, bukan hasil `await import("leaflet")`.
   *
   * Plugin Leaflet gaya lama menempelkan dirinya ke objek global —
   * markercluster menambahkan L.markerClusterGroup ke sana. Di bawah bundler,
   * namespace modul hasil import adalah objek yang BERBEDA dari window.L, dan
   * namespace itu tidak ikut kebagian tambahan si plugin: memanggilnya lewat
   * namespace melempar "L.markerClusterGroup is not a function" padahal
   * plugin-nya jelas sudah termuat. Memakai satu objek yang sama untuk inti dan
   * plugin menutup seluruh kelas bug ini.
   */
  const L = (window as unknown as { L: typeof import("leaflet") }).L;

  const hematGerak = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const peta = L.map(wadah, {
    // Penanda bisa berjumlah ribuan. Canvas menggambarnya sebagai piksel,
    // bukan ribuan elemen DOM yang harus di-layout.
    preferCanvas: true,
    // Kontrol bawaan diganti tombol sendiri supaya ukuran sentuhnya 44px dan
    // posisinya terjangkau ibu jari.
    zoomControl: false,
    center: [PUSAT_AWAL[0], PUSAT_AWAL[1]],
    zoom: ZOOM_AWAL,
    minZoom: ZOOM_MIN,
    maxZoom: ZOOM_MAKS,
    maxBounds: [
      [BATAS_SURABAYA[0][0], BATAS_SURABAYA[0][1]],
      [BATAS_SURABAYA[1][0], BATAS_SURABAYA[1][1]],
    ],
    // Geseran keluar kota ditarik balik penuh: di luar bounds tidak ada titik
    // parkir sama sekali, dan layar kosong terbaca sebagai aplikasi rusak.
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
    // Tema terang, sejalan dengan keputusan di globals.css: penggunanya membaca
    // layar di bawah matahari.
    flavor: "light",
    maxDataZoom: ZOOM_DATA_MAKS,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, DPR_MAKS),
  });

  if (opsi.onTileError) lapisan.on("tileerror", opsi.onTileError);
  lapisan.addTo(peta);

  /**
   * Penjaga tepi kosong.
   *
   * ZOOM_MIN dan ZOOM_AWAL di atas pas untuk layar ponsel — di 375px, z12
   * memang membuat kotak Surabaya mengisi layar penuh. Tapi di jendela desktop
   * yang lebar, zoom yang sama membuat viewport lebih luas daripada kotaknya,
   * dan tepi layar terisi daerah putih di luar cakupan berkas tile.
   * getBoundsZoom(batas, true) menjawab "zoom terkecil yang masih membuat layar
   * seluruhnya berada DI DALAM kotak", jadi angka di atas tetap dipakai apa
   * adanya kecuali ketika ia akan memunculkan tepi kosong.
   */
  const kotakTampilan = L.latLngBounds(
    [BATAS_SURABAYA[0][0], BATAS_SURABAYA[0][1]],
    [BATAS_SURABAYA[1][0], BATAS_SURABAYA[1][1]],
  );
  const setelBatasZoomKeluar = () => {
    peta.setMinZoom(Math.max(ZOOM_MIN, peta.getBoundsZoom(kotakTampilan, true)));
  };

  /**
   * ResizeObserver, bukan event 'resize' milik Leaflet.
   *
   * Saat efek pemanggil berjalan, kontainer peta kadang belum punya ukuran sama
   * sekali (0x0) karena layout browser belum sempat jalan. Menghitung batas
   * zoom pada saat itu menghasilkan angka yang salah, dan Leaflet juga meminta
   * tile untuk kotak yang salah sehingga peta sempat tergambar hanya di sekolom
   * sempit. ResizeObserver menyala tepat ketika ukuran sesungguhnya sudah ada —
   * dan sekaligus menangani rotasi layar, bilah alamat ponsel yang menyusut,
   * dan jendela desktop yang diseret.
   */
  const pengamatUkuran = new ResizeObserver(() => {
    peta.invalidateSize();
    setelBatasZoomKeluar();
    if (peta.getZoom() < peta.getMinZoom()) {
      peta.setZoom(peta.getMinZoom(), { animate: false });
    }
  });
  pengamatUkuran.observe(wadah);

  // Atribusi OSM wajib tampil (lisensi ODbL), tapi tempat bawaannya kanan-bawah
  // — tepat di bawah tombol zoom. Dipindah, bukan disembunyikan.
  peta.attributionControl.setPosition("bottomleft");

  return {
    L,
    peta,
    bersihkan: () => pengamatUkuran.disconnect(),
  };
}
