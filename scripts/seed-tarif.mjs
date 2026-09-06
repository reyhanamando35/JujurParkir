#!/usr/bin/env node
/**
 * seed-tarif.mjs — mengisi tabel `tarif` dengan angka Perda.
 *
 *   node scripts/seed-tarif.mjs
 *
 * Idempoten: dijalankan berulang kali hanya memperbarui angkanya, tidak
 * menggandakan baris. Kunci uniknya (kategori, jenis_kendaraan, mode).
 *
 * =====================================================================
 * ISI DULU `SUMBER` DI BAWAH SEBELUM MENJALANKAN.
 *
 * Skrip ini MENOLAK jalan selama sumbernya kosong, dan itu disengaja.
 * Kolom `sumber` adalah satu-satunya hal yang membuat angka di bawah bisa
 * dibedakan dari angka karangan. Aplikasi ini menampilkan tarif ke warga yang
 * akan memakainya untuk berdebat dengan jukir di pinggir jalan — angka tanpa
 * rujukan yang bisa ditelusuri lebih berbahaya daripada tidak ada angka
 * sama sekali.
 * =====================================================================
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rujukan pasal atau lampiran Perda tempat kedelapan angka di bawah berasal.
 * Contoh bentuk yang benar: "Perda 7/2023 Lampiran I huruf C".
 */
const SUMBER = "Perda 7/2023";

/**
 * Angka dari Perda.
 *
 *   mode non_progresif — sekali bayar, angkanya masuk `tarif_awal`
 *   mode progresif     — dibayar per jam, angkanya masuk `tarif_per_jam`
 *
 * Kolom yang tidak ditetapkan Perda dibiarkan null, BUKAN nol. Null berarti
 * "tidak ditetapkan", nol berarti "gratis" — dua pernyataan yang berbeda.
 */
const TARIF = [
  // Sekali bayar
  { kategori: "non_zona", kendaraan: "motor", mode: "non_progresif", awal: 3000, perJam: null },
  { kategori: "non_zona", kendaraan: "mobil", mode: "non_progresif", awal: 5000, perJam: null },
  { kategori: "zona", kendaraan: "motor", mode: "non_progresif", awal: 5000, perJam: null },
  { kategori: "zona", kendaraan: "mobil", mode: "non_progresif", awal: 10000, perJam: null },

  // Progresif, per jam
  { kategori: "non_zona", kendaraan: "motor", mode: "progresif", awal: null, perJam: 1000 },
  { kategori: "non_zona", kendaraan: "mobil", mode: "progresif", awal: null, perJam: 2000 },
  { kategori: "zona", kendaraan: "motor", mode: "progresif", awal: null, perJam: 2000 },
  { kategori: "zona", kendaraan: "mobil", mode: "progresif", awal: null, perJam: 3000 },
];

const AKAR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** .env.local dibaca sendiri supaya skrip ini tidak butuh dependensi apa pun. */
function muatEnv() {
  const teks = readFileSync(join(AKAR, ".env.local"), "utf8");
  for (const baris of teks.split(/\r?\n/)) {
    const cocok = baris.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!cocok) continue;
    const nilai = cocok[2].replace(/^["']|["']$/g, "");
    if (!process.env[cocok[1]]) process.env[cocok[1]] = nilai;
  }
}

async function utama() {
  if (SUMBER.trim().length === 0) {
    throw new Error(
      "SUMBER masih kosong. Isi rujukan pasal atau lampiran Perda di bagian atas berkas ini dulu — angka tarif tanpa sumber tidak boleh masuk basis data.",
    );
  }

  muatEnv();
  const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KUNCI = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_SUPABASE || !KUNCI) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus ada di .env.local",
    );
  }

  console.log(`Basis data: ${URL_SUPABASE}`);
  console.log(`Sumber    : ${SUMBER}\n`);

  // Kategori diperiksa dulu ke tabel referensi. Kalau 0010 belum dijalankan,
  // 'progresif' masih ada di sana sebagai kategori — dan itu tanda migrasinya
  // tertinggal, bukan alasan untuk diam-diam melanjutkan.
  const jawabKategori = await fetch(
    `${URL_SUPABASE}/rest/v1/kategori_tarif?select=kode`,
    { headers: { apikey: KUNCI, Authorization: `Bearer ${KUNCI}` } },
  );
  if (!jawabKategori.ok) {
    throw new Error(
      `Gagal membaca kategori_tarif (HTTP ${jawabKategori.status}). Sudah menjalankan 0009?`,
    );
  }
  const kategoriAda = new Set((await jawabKategori.json()).map((k) => k.kode));

  for (const t of TARIF) {
    if (!kategoriAda.has(t.kategori)) {
      throw new Error(
        `Kategori "${t.kategori}" tidak ada di tabel kategori_tarif. Jalankan migrasi 0009 dan 0010 dulu.`,
      );
    }
  }

  const baris = TARIF.map((t) => ({
    kategori: t.kategori,
    jenis_kendaraan: t.kendaraan,
    mode: t.mode,
    tarif_awal: t.awal,
    tarif_per_jam: t.perJam,
    tarif_maks: null,
    sumber: SUMBER,
  }));

  const jawab = await fetch(
    `${URL_SUPABASE}/rest/v1/tarif?on_conflict=kategori,jenis_kendaraan,mode`,
    {
      method: "POST",
      headers: {
        apikey: KUNCI,
        Authorization: `Bearer ${KUNCI}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(baris),
    },
  );

  const isi = await jawab.text();
  if (!jawab.ok) {
    throw new Error(`Gagal menyimpan tarif (HTTP ${jawab.status}): ${isi}`);
  }

  const tersimpan = JSON.parse(isi);
  console.log(`${tersimpan.length} baris tarif tersimpan:\n`);
  for (const t of TARIF) {
    const nilai =
      t.mode === "progresif"
        ? `Rp${t.perJam.toLocaleString("id-ID")} / jam`
        : `Rp${t.awal.toLocaleString("id-ID")} sekali bayar`;
    console.log(`  ${t.kategori.padEnd(9)} ${t.kendaraan.padEnd(6)} ${nilai}`);
  }
  console.log("\nAngka ini sekarang tampil sebagai rentang di peta warga.");
}

utama().catch((galat) => {
  console.error(`\nGAGAL: ${galat.message}`);
  process.exitCode = 1;
});
