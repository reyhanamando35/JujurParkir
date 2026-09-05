#!/usr/bin/env node
/**
 * seed-petugas.mjs — membuat akun petugas untuk pengembangan.
 *
 *   node scripts/seed-petugas.mjs
 *
 * Memakai Admin API resmi GoTrue, BUKAN insert mentah ke auth.users.
 *
 * Insert mentah adalah cara yang dipakai blok seed di 0001_init.sql, dan itu
 * pula yang tidak pernah berhasil di proyek ini: tabel auth.users milik
 * Supabase, kolomnya berubah antar versi GoTrue, dan satu kolom wajib yang
 * terlewat membuat akunnya ada tapi tidak bisa dipakai login. Admin API tidak
 * peduli versi skema — ia memakai jalur yang sama dengan pendaftaran biasa.
 *
 * Idempoten: dijalankan berulang kali hanya menyetel ulang kata sandi dan
 * memperbarui baris petugas, tidak menggandakan akun.
 *
 * PERINGATAN: kata sandi di bawah ada di dalam repositori, jadi TIDAK RAHASIA.
 * Ini hanya untuk pengembangan. Sebelum rilis, ganti lewat Supabase Auth.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

muatEnv();

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KUNCI_LAYANAN = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_SUPABASE || !KUNCI_LAYANAN) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus ada di .env.local",
  );
}

const AKUN = [
  {
    email: "admin@dishub.com",
    kataSandi: "Dishub#2026",
    nama: "Admin Dishub",
    peran: "dishub",
    wilayah: null,
  },
  {
    email: "katar.genteng@katar.com",
    kataSandi: "Katar#2026",
    nama: "Koordinator Wilayah Genteng",
    peran: "katar",
    wilayah: "Genteng",
  },
];

const kepala = {
  apikey: KUNCI_LAYANAN,
  Authorization: `Bearer ${KUNCI_LAYANAN}`,
  "Content-Type": "application/json",
};

async function panggil(jalur, opsi = {}) {
  const jawaban = await fetch(`${URL_SUPABASE}${jalur}`, {
    ...opsi,
    headers: { ...kepala, ...(opsi.headers ?? {}) },
  });
  const teks = await jawaban.text();
  let isi = null;
  try {
    isi = teks.length > 0 ? JSON.parse(teks) : null;
  } catch {
    isi = teks;
  }
  return { ok: jawaban.ok, status: jawaban.status, isi };
}

/** Cari akun berdasarkan email di seluruh halaman daftar pengguna. */
async function cariPengguna(email) {
  for (let halaman = 1; halaman <= 20; halaman += 1) {
    const { ok, isi, status } = await panggil(
      `/auth/v1/admin/users?page=${halaman}&per_page=200`,
    );
    if (!ok) throw new Error(`Gagal membaca daftar pengguna (HTTP ${status})`);
    const daftar = isi?.users ?? [];
    const ketemu = daftar.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (ketemu) return ketemu;
    if (daftar.length < 200) return null;
  }
  return null;
}

/**
 * Kolom tabel petugas di basis data ini belum tentu sama dengan yang tertulis
 * di 0001_init.sql — basis data yang sedang dipakai tidak punya `username`
 * maupun `email`. Ketimbang menebak, kolomnya diperiksa dulu supaya skrip ini
 * jalan di skema mana pun tanpa perlu DDL.
 */
async function kolomTersedia(nama) {
  const { ok, isi } = await panggil(
    `/rest/v1/petugas?select=${nama}&limit=1`,
  );
  if (ok) return true;
  const pesan = typeof isi === "object" ? (isi?.message ?? "") : String(isi);
  if (pesan.includes("does not exist")) return false;
  throw new Error(`Tidak bisa memeriksa kolom "${nama}": ${pesan}`);
}

async function utama() {
  console.log(`Basis data: ${URL_SUPABASE}\n`);

  const adaUsername = await kolomTersedia("username");
  const adaEmail = await kolomTersedia("email");
  console.log(
    `Kolom petugas — username: ${adaUsername ? "ada" : "tidak ada"}, ` +
      `email: ${adaEmail ? "ada" : "tidak ada"}\n`,
  );

  const { ok: okWilayah, isi: wilayah } = await panggil(
    "/rest/v1/wilayah?select=id,nama",
  );
  if (!okWilayah) throw new Error("Gagal membaca tabel wilayah.");

  for (const akun of AKUN) {
    let pengguna = await cariPengguna(akun.email);

    if (pengguna) {
      // Kata sandi disetel ulang supaya menjalankan skrip ini selalu
      // menghasilkan keadaan yang sama, bukan bergantung isi sebelumnya.
      const { ok, status, isi } = await panggil(
        `/auth/v1/admin/users/${pengguna.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            password: akun.kataSandi,
            email_confirm: true,
          }),
        },
      );
      if (!ok) throw new Error(`Gagal memperbarui ${akun.email} (HTTP ${status}): ${JSON.stringify(isi)}`);
      console.log(`  ${akun.email} — sudah ada, kata sandi disetel ulang`);
    } else {
      const { ok, status, isi } = await panggil("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: akun.email,
          password: akun.kataSandi,
          // Tanpa ini akunnya menunggu klik tautan verifikasi yang dikirim ke
          // domain fiktif, dan tidak akan pernah bisa dipakai login.
          email_confirm: true,
        }),
      });
      if (!ok) throw new Error(`Gagal membuat ${akun.email} (HTTP ${status}): ${JSON.stringify(isi)}`);
      pengguna = isi;
      console.log(`  ${akun.email} — akun Auth dibuat`);
    }

    const baris = {
      id: pengguna.id,
      nama: akun.nama,
      peran: akun.peran,
      wilayah_id:
        akun.wilayah === null
          ? null
          : (wilayah.find((w) => w.nama === akun.wilayah)?.id ?? null),
    };
    if (akun.wilayah !== null && baris.wilayah_id === null) {
      throw new Error(`Wilayah "${akun.wilayah}" tidak ada di tabel wilayah.`);
    }
    if (adaUsername) baris.username = akun.email.split("@")[0].replace(/\./g, "_");
    if (adaEmail) baris.email = akun.email;

    const { ok, status, isi } = await panggil("/rest/v1/petugas", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(baris),
    });
    if (!ok) throw new Error(`Gagal menulis baris petugas ${akun.email} (HTTP ${status}): ${JSON.stringify(isi)}`);
    console.log(`               baris petugas tersimpan (peran ${akun.peran}, wilayah_id ${baris.wilayah_id})\n`);
  }

  console.log("Selesai. Coba masuk di /petugas dengan:");
  for (const a of AKUN) console.log(`  ${a.email}  /  ${a.kataSandi}`);
  console.log("\nKata sandi ini ada di dalam repositori — hanya untuk pengembangan.");
}

utama().catch((galat) => {
  console.error(`\nGAGAL: ${galat.message}`);
  process.exitCode = 1;
});
