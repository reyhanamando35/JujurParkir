/**
 * Turunan wilayah Surabaya dari koordinat.
 *
 * Kembaran persis dari turunkanWilayah() di scripts/build-titik.mjs. Diduplikasi
 * karena skrip itu berjalan di Node sebagai .mjs sementara ini dipakai Server
 * Action; keduanya harus memberi jawaban yang sama supaya laporan Jalur B
 * (koordinat bebas) jatuh ke wilayah yang sama dengan titik resmi di sekitarnya.
 *
 * PERKIRAAN, BUKAN BATAS RESMI. Kita belum punya poligon kecamatan.
 */

export const WILAYAH = ["Pusat", "Utara", "Timur", "Selatan", "Barat"] as const;
export type Wilayah = (typeof WILAYAH)[number];

const PUSAT_KOTA = { lat: -7.2756, lng: 112.7378 };

export function turunkanWilayah(lat: number, lng: number): Wilayah {
  // Kotak inti kota diperiksa lebih dulu supaya titik di sekitar Genteng,
  // Bubutan, dan Tegalsari tidak terlempar ke salah satu penjuru hanya karena
  // simpangannya beberapa ratus meter.
  if (lat >= -7.27 && lat <= -7.25 && lng >= 112.73 && lng <= 112.75) {
    return "Pusat";
  }

  const dLat = lat - PUSAT_KOTA.lat;
  const dLng = lng - PUSAT_KOTA.lng;

  // Rentang lintang kota jauh lebih pendek daripada bujurnya, jadi keduanya
  // dinormalisasi dulu; tanpa itu hampir semua titik jatuh ke Timur/Barat.
  const bobotLat = Math.abs(dLat) / 0.12;
  const bobotLng = Math.abs(dLng) / 0.14;

  if (bobotLat >= bobotLng) return dLat > 0 ? "Utara" : "Selatan";
  return dLng > 0 ? "Timur" : "Barat";
}
