/**
 * Tarif rujukan parkir tepi jalan umum.
 *
 * Angkanya TIDAK lagi ditulis di berkas ini. Sumbernya tabel `tarif` di basis
 * data, yang kolom `sumber`-nya wajib diisi rujukan pasal — jadi tidak mungkin
 * menyimpan angka tanpa menyebut asalnya.
 *
 * Sebelumnya di sini ada tabel angka contoh. Itu dibuang: begitu aplikasi
 * membaca basis data, konstanta contoh berubah jadi jebakan — ia akan tampil
 * sebagai tarif resmi setiap kali tabelnya kebetulan kosong. Kalau belum ada
 * baris, yang benar adalah tidak menampilkan angka sama sekali.
 */

export type KategoriTarif = "non_zona" | "zona" | "insidentil" | "petak_khusus";
export type JenisKendaraan = "motor" | "mobil";
export type ModeTarif = "progresif" | "non_progresif";

/** Satu baris tabel `tarif`. */
export type BarisTarif = {
  id: number;
  kategori: string;
  jenis_kendaraan: string;
  mode: string;
  tarif_awal: number | null;
  tarif_per_jam: number | null;
  tarif_maks: number | null;
  sumber: string;
};

/**
 * Satu baris tabel referensi `kategori_tarif`.
 *
 * Daftar kategorinya sengaja TIDAK ditulis sebagai konstanta di sini. Sejak
 * 0009 kosakatanya hidup di basis data dan ditegakkan foreign key dari dua
 * sisi; menyalinnya ke berkas ini berarti dua daftar yang bisa berbeda isi,
 * dan yang di aplikasi selalu yang lebih dulu usang.
 */
export type KategoriRef = { kode: string; nama: string };

/**
 * Dari mana kategori sebuah titik ditetapkan — kolom `titik_parkir.sumber_kategori`.
 *
 * 'belum_verif' bukan sumber; ia justru pernyataan bahwa penetapannya belum
 * punya dasar. Lihat `sumberMengikat` di bawah.
 */
export const LABEL_SUMBER_KATEGORI: Record<string, string> = {
  perda: "Perda",
  kepwal: "Keputusan Wali Kota",
  uptd: "penetapan UPTD",
  belum_verif: "penetapan sementara",
};

/**
 * Apakah penetapan kategori boleh dipakai menyempitkan angka yang dilihat warga.
 *
 * Hanya kalau ada dasar hukumnya. Kategori yang ditandai 'belum_verif' — atau
 * yang sumbernya belum diisi sama sekali — tetap tersimpan dan tetap terlihat
 * oleh petugas, tapi TIDAK boleh mengubah tampilan di peta: menampilkan satu
 * angka tepat untuk sebuah titik adalah klaim bahwa itulah tarif resmi di sana,
 * dan klaim itu hanya boleh dibuat kalau memang ada yang menetapkannya.
 */
export function sumberMengikat(sumber: string | null): boolean {
  return sumber === "perda" || sumber === "kepwal" || sumber === "uptd";
}

export const LABEL_MODE: Record<string, string> = {
  progresif: "Progresif",
  non_progresif: "Sekali bayar",
};

export const NAMA_KENDARAAN: Record<JenisKendaraan, string> = {
  motor: "Motor",
  mobil: "Mobil",
};

/** Nilai tak dikenal ditampilkan apa adanya, bukan disembunyikan. */
export function labelMode(nilai: string): string {
  return LABEL_MODE[nilai] ?? nilai;
}

export function rupiah(nilai: number): string {
  return `Rp${nilai.toLocaleString("id-ID")}`;
}

export type Rentang = { min: number; maks: number };

/**
 * Dua cara membayar yang tidak boleh dicampur jadi satu angka.
 *
 * sekaliBayar — dari baris mode 'non_progresif'. Jumlah yang benar-benar
 *               dibayar sekali parkir.
 * perJam      — dari baris mode 'progresif'. Ini LAJU, bukan jumlah: menyatukan
 *               "Rp1.000 per jam" ke dalam rentang yang sama dengan "Rp3.000
 *               sekali bayar" menghasilkan angka yang tidak berarti apa-apa
 *               dan menyesatkan orang yang membacanya di pinggir jalan.
 */
export type RingkasTarif = {
  sekaliBayar: Rentang | null;
  perJam: Rentang | null;
};

function rentangDari(nilai: number[]): Rentang | null {
  if (nilai.length === 0) return null;
  return { min: Math.min(...nilai), maks: Math.max(...nilai) };
}

/**
 * Apa yang sudah diketahui tentang SATU titik parkir, dari `titik_parkir`.
 *
 * Keduanya boleh null, dan null di sini punya arti tegas: "belum diverifikasi".
 * Bukan "tidak ada", bukan pula nilai bawaan yang boleh ditebak. Selama masih
 * null, tarif titik itu hanya bisa dinyatakan sebagai rentang.
 */
export type SifatTarifTitik = {
  kategori: string | null;
  progresif: boolean | null;
};

/**
 * Rentang tarif untuk satu jenis kendaraan.
 *
 * Tanpa argumen `titik`, hasilnya melintasi SELURUH kategori dan kedua mode —
 * pernyataan paling lemah yang masih benar, dipakai untuk titik yang belum
 * diverifikasi.
 *
 * Dengan `titik`, barisnya disaring lebih dulu, dan rentangnya menyempit
 * sendiri: begitu kategori DAN mode sebuah titik diketahui, yang tersisa satu
 * baris saja dan `teksRentang` menuliskannya sebagai satu angka. Penyempitan
 * itu hanya boleh terjadi karena ada yang benar-benar menetapkannya di
 * `titik_parkir` — tidak pernah karena ditebak dari alamat atau wilayah.
 *
 * Untuk baris sekali bayar yang dipakai batas bawah adalah tarif_awal dan
 * batas atas tarif_maks — atau tarif_awal lagi kalau batas atasnya memang tidak
 * ditetapkan. Untuk baris progresif yang dipakai tarif_per_jam.
 */
export function ringkasTarif(
  baris: BarisTarif[],
  kendaraan: JenisKendaraan,
  titik?: SifatTarifTitik,
): RingkasTarif {
  const sekali: number[] = [];
  const perJam: number[] = [];

  for (const b of baris) {
    if (b.jenis_kendaraan !== kendaraan) continue;
    if (titik?.kategori != null && b.kategori !== titik.kategori) continue;
    if (titik?.progresif != null && (b.mode === "progresif") !== titik.progresif) {
      continue;
    }
    if (b.mode === "progresif") {
      if (b.tarif_per_jam !== null) perJam.push(b.tarif_per_jam);
      continue;
    }
    if (b.tarif_awal !== null) sekali.push(b.tarif_awal);
    if (b.tarif_maks !== null) sekali.push(b.tarif_maks);
  }

  return { sekaliBayar: rentangDari(sekali), perJam: rentangDari(perJam) };
}

/** Teks rentang siap tampil, mis. "Rp1.000–Rp3.000". */
export function teksRentang(r: Rentang): string {
  return r.min === r.maks ? rupiah(r.min) : `${rupiah(r.min)}–${rupiah(r.maks)}`;
}

/**
 * Rujukan yang ditampilkan sebagai sumber.
 *
 * Kalau beberapa baris menyebut rujukan berbeda, semuanya disebut — bukan
 * dipilih salah satu. Angka yang ditampilkan memang berasal dari beberapa
 * pasal sekaligus, dan menyembunyikan sebagiannya membuat sitasinya keliru.
 */
export function sumberTarif(baris: BarisTarif[]): string | null {
  const unik = [...new Set(baris.map((b) => b.sumber.trim()).filter(Boolean))];
  return unik.length > 0 ? unik.join(" · ") : null;
}
