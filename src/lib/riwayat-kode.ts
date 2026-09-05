/**
 * Riwayat kode laporan di peramban.
 *
 * Kenapa ini ada: laporan warga anonim, jadi kode 6 karakter itu SATU-SATUNYA
 * pegangan yang dipunya pelapor. Tidak ada email atau nomor untuk mengirim
 * ulang kalau hilang.
 *
 * Versi sebelumnya menyimpannya sebagai satu nilai tunggal, sehingga orang yang
 * melapor dua kali kehilangan kode pertamanya tanpa pernah diberi tahu. Di sini
 * disimpan sebagai daftar.
 *
 * Ini kenyamanan, bukan jaminan. localStorage kosong di mode penyamaran, hilang
 * saat data situs dibersihkan, dan tidak pernah berpindah ke perangkat lain —
 * karena itu kodenya tetap harus ditampilkan untuk dicatat sendiri.
 *
 * Hanya boleh dipanggil dari peramban (effect atau penangan peristiwa).
 */

const KUNCI = "jujurparkir:riwayat-kode";
/** Kunci lama, satu kode saja. Dibaca sekali supaya kode lama tidak hilang. */
const KUNCI_LAMA = "jujurparkir:kode-laporan";
const BATAS = 20;

export type EntriKode = {
  kode: string;
  /** Epoch milidetik saat laporan dikirim. */
  pada: number;
};

function sah(nilai: unknown): nilai is EntriKode {
  if (typeof nilai !== "object" || nilai === null) return false;
  const e = nilai as Record<string, unknown>;
  return typeof e.kode === "string" && typeof e.pada === "number";
}

export function bacaRiwayatKode(): EntriKode[] {
  try {
    const mentah = localStorage.getItem(KUNCI);
    // JSON.parse melempar pada isi yang rusak, dan isi localStorage bisa saja
    // disunting tangan. Semua di dalam try yang sama.
    const terurai: unknown = mentah ? JSON.parse(mentah) : [];
    const daftar = Array.isArray(terurai) ? terurai.filter(sah) : [];

    const lama = localStorage.getItem(KUNCI_LAMA);
    if (lama && !daftar.some((e) => e.kode === lama)) {
      // Tanggalnya tidak pernah disimpan di format lama, jadi 0 — dan ditulis
      // sebagai "tanggal tidak tercatat" saat ditampilkan, bukan 1970.
      daftar.push({ kode: lama, pada: 0 });
    }

    return daftar.sort((a, b) => b.pada - a.pada).slice(0, BATAS);
  } catch {
    return [];
  }
}

export function simpanKode(kode: string): void {
  try {
    const tanpaDuplikat = bacaRiwayatKode().filter((e) => e.kode !== kode);
    const baru = [{ kode, pada: Date.now() }, ...tanpaDuplikat].slice(0, BATAS);
    localStorage.setItem(KUNCI, JSON.stringify(baru));
    // Kunci lama dibuang setelah isinya ikut terbawa ke daftar.
    localStorage.removeItem(KUNCI_LAMA);
  } catch {
    // Mode penyamaran memblokir localStorage. Kodenya tetap tampil di layar.
  }
  // Dipanggil di luar try: kalau penyimpanan gagal pun, pembaca yang sedang
  // menampilkan daftar tetap perlu tahu supaya tidak menyajikan cache basi.
  simpanan = null;
  for (const beri of pendengar) beri();
}

// ---------------------------------------------------------------------------
// Jembatan ke useSyncExternalStore
//
// localStorage adalah penyimpanan di luar React, dan membacanya lewat
// useEffect + setState berarti render pertama selalu menampilkan daftar kosong
// lalu berkedip. useSyncExternalStore memang primitif untuk kasus ini:
// snapshot server mengembalikan daftar kosong (di sana localStorage tidak ada),
// snapshot klien mengembalikan isi sebenarnya.
//
// `simpanan` wajib di-cache. useSyncExternalStore membandingkan hasil snapshot
// dengan Object.is; membaca ulang localStorage tiap panggilan menghasilkan
// array baru setiap kali dan React akan me-render tanpa henti.
// ---------------------------------------------------------------------------

const KOSONG: EntriKode[] = [];
const pendengar = new Set<() => void>();
let simpanan: EntriKode[] | null = null;

export function langganRiwayat(beri: () => void): () => void {
  pendengar.add(beri);
  return () => {
    pendengar.delete(beri);
  };
}

export function snapshotRiwayat(): EntriKode[] {
  simpanan ??= bacaRiwayatKode();
  return simpanan;
}

export function snapshotRiwayatServer(): EntriKode[] {
  return KOSONG;
}

/** Membersihkan kode dari isian pengguna: huruf besar, tanpa spasi. */
export function rapikanKode(mentah: string): string {
  return mentah.trim().toUpperCase().replace(/\s+/g, "");
}
