#!/usr/bin/env node
/**
 * build-titik.mjs — satu sumber, dua keluaran.
 *
 *   data/raw/titik_parkir_geocoded.csv
 *        -> public/data/titik-parkir.geojson      (dibaca frontend)
 *        -> supabase/migrations/0002_seed_titik.sql
 *
 * Sekali jalan, tidak ada dependensi di luar pustaka bawaan Node.
 *
 *   node scripts/build-titik.mjs
 *
 * Skrip ini sengaja BERHENTI dengan galat ketika menemukan sesuatu yang tidak
 * bisa ia pertanggungjawabkan (tabrakan hash, koordinat di luar Surabaya).
 * Data tarif parkir yang salah lebih buruk daripada data yang belum ada.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = join(dirname(fileURLToPath(import.meta.url)), "..");
const BERKAS_CSV = join(AKAR, "data", "raw", "titik_parkir_geocoded.csv");
const BERKAS_GEOJSON = join(AKAR, "public", "data", "titik-parkir.geojson");
const BERKAS_SQL = join(AKAR, "supabase", "migrations", "0002_seed_titik.sql");

/** Kotak Kota Surabaya. Apa pun di luar ini adalah kesalahan geocoding. */
const BATAS = { latMin: -7.4, latMaks: -7.15, lngMin: 112.55, lngMaks: 112.88 };

// ---------------------------------------------------------------------------
// Pembacaan CSV
// ---------------------------------------------------------------------------

/**
 * Parser CSV sesuai RFC 4180. Bukan `split(",")` — berkas ini punya koma di
 * dalam tanda kutip ("TK. LESTARI,EXPEDISI") dan tanda kutip ganda yang
 * di-escape ("PENYETAN ""DANGDUT"""). Memecah dengan koma polos merusak 40
 * baris dan menggeser kolom lat/lng ke kolom sebelahnya tanpa suara.
 */
function bacaCsv(teks) {
  const baris = [];
  let kolom = [];
  let nilai = "";
  let dalamKutip = false;

  for (let i = 0; i < teks.length; i += 1) {
    const c = teks[i];

    if (dalamKutip) {
      if (c === '"') {
        if (teks[i + 1] === '"') {
          nilai += '"';
          i += 1;
        } else {
          dalamKutip = false;
        }
      } else {
        nilai += c;
      }
      continue;
    }

    if (c === '"') {
      dalamKutip = true;
    } else if (c === ",") {
      kolom.push(nilai);
      nilai = "";
    } else if (c === "\r") {
      // Akhir baris CRLF; \n berikutnya yang menutup baris.
    } else if (c === "\n") {
      kolom.push(nilai);
      baris.push(kolom);
      kolom = [];
      nilai = "";
    } else {
      nilai += c;
    }
  }

  if (nilai.length > 0 || kolom.length > 0) {
    kolom.push(nilai);
    baris.push(kolom);
  }

  return baris.filter((b) => b.some((sel) => sel.trim().length > 0));
}

// ---------------------------------------------------------------------------
// Normalisasi
// ---------------------------------------------------------------------------

/** Rapatkan spasi ganda, buang spasi tepi, samakan huruf besar. */
const rapikan = (nilai) => (nilai ?? "").replace(/\s+/g, " ").trim();
const kunciNormal = (nilai) => rapikan(nilai).toUpperCase();

/**
 * Id stabil dari isi barisnya sendiri, bukan dari nomor urut.
 *
 * Kolom "No" hanya urutan hasil scraping: begitu sumbernya di-scrape ulang dan
 * satu baris disisipkan di tengah, seluruh nomor sesudahnya bergeser dan setiap
 * laporan warga yang menunjuk id lama tiba-tiba menunjuk titik parkir yang
 * berbeda. Hash dari alamat + lokasi tidak ikut bergeser.
 */
function buatId(alamat, lokasi) {
  const kunci = `${kunciNormal(alamat)}|${kunciNormal(lokasi)}`;
  return { kunci, id: createHash("sha256").update(kunci).digest("hex").slice(0, 8) };
}

/**
 * "9:00 - 17:00" dan "08.00 - 17.00" adalah maksud yang sama ditulis dua cara.
 * Yang tidak cocok dengan pola dikembalikan null — TIDAK ditebak. Nilai seperti
 * "09.00 - 2,100" jelas rusak, dan menebaknya jadi 21.00 berarti mengarang jam
 * jaga yang akan dibaca warga sebagai fakta.
 */
function bacaJam(teksJam) {
  const bersih = rapikan(teksJam);
  if (bersih.length === 0) return { mulai: null, selesai: null };

  const cocok = bersih.match(
    /^(\d{1,2})\s*[.:]\s*(\d{2})\s*(?:-|–|—|s\/d|sd|sampai)\s*(\d{1,2})\s*[.:]\s*(\d{2})$/i,
  );
  if (!cocok) return { mulai: null, selesai: null };

  const jamMulai = Number(cocok[1]);
  const menitMulai = Number(cocok[2]);
  const jamSelesai = Number(cocok[3]);
  const menitSelesai = Number(cocok[4]);

  const sah = (jam, menit, batasJam) =>
    jam >= 0 && jam <= batasJam && menit >= 0 && menit <= 59;

  // Jam selesai boleh 24:00 — itu cara lazim menulis "sampai tengah malam".
  if (!sah(jamMulai, menitMulai, 23) || !sah(jamSelesai, menitSelesai, 24)) {
    return { mulai: null, selesai: null };
  }
  if (jamSelesai === 24 && menitSelesai !== 0) {
    return { mulai: null, selesai: null };
  }

  const pad = (n) => String(n).padStart(2, "0");
  return {
    mulai: `${pad(jamMulai)}:${pad(menitMulai)}`,
    selesai: `${pad(jamSelesai)}:${pad(menitSelesai)}`,
  };
}

const kutipSql = (nilai) =>
  nilai === null || nilai === undefined ? "null" : `'${String(nilai).replaceAll("'", "''")}'`;

// ---------------------------------------------------------------------------
// Jalan
// ---------------------------------------------------------------------------

function utama() {
  // utf-8-sig: BOM di awal berkas ikut terbaca sebagai karakter dan akan
  // menempel di nama kolom pertama ("﻿No") kalau tidak dibuang.
  const mentah = readFileSync(BERKAS_CSV, "utf8").replace(/^﻿/, "");
  const baris = bacaCsv(mentah);

  const judul = baris[0].map((h) => rapikan(h));
  const wajib = ["Alamat", "Lokasi", "Jam_Jaga", "lat", "lng"];
  for (const kolom of wajib) {
    if (!judul.includes(kolom)) {
      throw new Error(`Kolom "${kolom}" tidak ada di CSV. Judul: ${judul.join(", ")}`);
    }
  }
  const indeks = Object.fromEntries(judul.map((h, i) => [h, i]));

  const titik = [];
  const masalah = [];

  for (let n = 1; n < baris.length; n += 1) {
    const b = baris[n];
    const nomorBaris = n + 1;

    const alamat = rapikan(b[indeks.Alamat]);
    const lokasi = rapikan(b[indeks.Lokasi]);
    const jamTeks = rapikan(b[indeks.Jam_Jaga]);
    const lat = Number(rapikan(b[indeks.lat]));
    const lng = Number(rapikan(b[indeks.lng]));

    if (alamat.length === 0) {
      masalah.push(`baris ${nomorBaris}: kolom Alamat kosong`);
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      masalah.push(`baris ${nomorBaris}: lat/lng bukan angka ("${b[indeks.lat]}", "${b[indeks.lng]}")`);
      continue;
    }
    // Aturan 6: berhenti, jangan buang diam-diam. Titik di luar Surabaya berarti
    // geocoder salah menebak kota, dan itu perlu diperbaiki di hulu.
    if (lat < BATAS.latMin || lat > BATAS.latMaks || lng < BATAS.lngMin || lng > BATAS.lngMaks) {
      masalah.push(
        `baris ${nomorBaris}: koordinat di luar Surabaya (${lat}, ${lng}) — "${alamat}"`,
      );
      continue;
    }

    const { kunci, id } = buatId(alamat, lokasi);
    const { mulai, selesai } = bacaJam(jamTeks);

    titik.push({
      id,
      kunci,
      alamat,
      lokasi,
      jamTeks,
      jamMulai: mulai,
      jamSelesai: selesai,
      lat,
      lng,
      // Koordinat dipakai sebagai teks apa adanya: membandingkan pecahan
      // desimal lewat angka mengundang selisih presisi yang tak kasat mata.
      koordinat: `${rapikan(b[indeks.lat])},${rapikan(b[indeks.lng])}`,
    });
  }

  if (masalah.length > 0) {
    console.error("\nData ditolak — perbaiki di hulu, bukan di sini:\n");
    for (const m of masalah) console.error(`  ${m}`);
    throw new Error(`${masalah.length} baris gagal validasi.`);
  }

  // --- Tabrakan hash vs baris kembar -------------------------------------
  // Dua hal yang berbeda dan diperlakukan berbeda:
  //   tabrakan  = kunci BERBEDA menghasilkan hash sama -> berhenti (aturan 1)
  //   kembar    = kunci SAMA, memang dua baris identik -> dipertahankan (aturan 5)
  const pemilikId = new Map();
  const kembar = new Map();

  for (const t of titik) {
    const pemilik = pemilikId.get(t.id);
    if (pemilik === undefined) {
      pemilikId.set(t.id, t.kunci);
    } else if (pemilik !== t.kunci) {
      throw new Error(
        `Tabrakan hash pada id "${t.id}":\n  ${pemilik}\n  ${t.kunci}\n` +
          "Perpanjang potongan hash di buatId(), jangan biarkan salah satu tertimpa.",
      );
    }
    if (!kembar.has(t.kunci)) kembar.set(t.kunci, []);
    kembar.get(t.kunci).push(t);
  }

  // Baris kembar dipertahankan, tapi id-nya harus tetap unik supaya laporan
  // bisa menunjuk satu baris tertentu. Keduanya identik pada alamat + lokasi,
  // jadi urutan penomoran tidak mengubah arti.
  const daftarKembar = [];
  for (const [kunci, rombongan] of kembar) {
    if (rombongan.length === 1) continue;
    daftarKembar.push({ kunci, jumlah: rombongan.length, anggota: rombongan });
    rombongan.forEach((t, i) => {
      if (i > 0) t.id = `${t.id}-${i + 1}`;
    });
  }

  // --- Presisi ------------------------------------------------------------
  // Geocoder jatuh ke titik tengah ruas jalan, bukan nomor rumah. Kalau satu
  // koordinat dipakai lebih dari satu alamat, itu bukti langsung bahwa pin-nya
  // mewakili jalan, bukan bangunan. 'exact' tidak pernah ditulis: tidak ada
  // satu pun bukti di data ini yang mendukungnya.
  const jumlahPerKoordinat = new Map();
  for (const t of titik) {
    jumlahPerKoordinat.set(t.koordinat, (jumlahPerKoordinat.get(t.koordinat) ?? 0) + 1);
  }
  for (const t of titik) {
    t.presisi = jumlahPerKoordinat.get(t.koordinat) > 1 ? "jalan" : "perkiraan";
  }

  tulisGeojson(titik);
  tulisSql(titik);
  cetakRingkasan(titik, jumlahPerKoordinat, daftarKembar);
}

function tulisGeojson(titik) {
  const fitur = titik.map((t) => ({
    type: "Feature",
    // id di tingkat Feature: bagian dari spesifikasi GeoJSON, dan Leaflet
    // meneruskannya apa adanya.
    id: t.id,
    geometry: { type: "Point", coordinates: [t.lng, t.lat] },
    properties: {
      alamat: t.alamat,
      lokasi: t.lokasi,
      jam_mulai: t.jamMulai,
      jam_selesai: t.jamSelesai,
      jam_teks: t.jamTeks,
      presisi: t.presisi,
      // kategori_tarif dan tarif sengaja TIDAK ada di sini. Perda tidak
      // memetakan alamat ke kategori tarif, jadi kolom kosong pun akan
      // terbaca sebagai "sudah dicek, hasilnya nihil" — padahal belum dicek.
    },
  }));

  mkdirSync(dirname(BERKAS_GEOJSON), { recursive: true });
  writeFileSync(
    BERKAS_GEOJSON,
    `${JSON.stringify({ type: "FeatureCollection", features: fitur })}\n`,
    "utf8",
  );
}

function tulisSql(titik) {
  const nilai = titik
    .map((t) =>
      [
        "  (",
        [
          kutipSql(t.id),
          kutipSql(t.alamat),
          kutipSql(t.lokasi.length > 0 ? t.lokasi : null),
          kutipSql(t.jamTeks.length > 0 ? t.jamTeks : null),
          t.jamMulai === null ? "null" : kutipSql(t.jamMulai),
          t.jamSelesai === null ? "null" : kutipSql(t.jamSelesai),
          kutipSql(t.presisi),
          `st_setsrid(st_makepoint(${t.lng}, ${t.lat}), 4326)::geography`,
        ].join(", "),
        ")",
      ].join(""),
    )
    .join(",\n");

  const sql = `-- =============================================================
-- 0002_seed_titik.sql
-- DIBANGKITKAN OTOMATIS oleh scripts/build-titik.mjs — jangan disunting tangan.
-- Sumber: data/raw/titik_parkir_geocoded.csv (${titik.length} titik).
--
-- Kenapa ALTER TABLE ada di berkas seed dan bukan di migrasi 0003 tersendiri:
-- migrasi dijalankan berurutan menurut nama berkas, jadi 0003 akan berjalan
-- SESUDAH berkas ini. Kolom yang dipakai INSERT di bawah harus sudah ada saat
-- baris ini dieksekusi, sehingga penambahan kolomnya harus ikut di sini.
-- 0001_init.sql tidak disentuh sama sekali.
-- =============================================================

begin;

-- Kolom tambahan. Semuanya idempoten supaya berkas ini aman dijalankan ulang.
alter table titik_parkir add column if not exists kode_titik  text;
alter table titik_parkir add column if not exists presisi     text;
alter table titik_parkir add column if not exists jam_mulai   time;
alter table titik_parkir add column if not exists jam_selesai time;

comment on column titik_parkir.kode_titik is
  'Id stabil: 8 heksadesimal pertama sha256(alamat|lokasi) yang dinormalisasi. Sengaja bukan nomor urut scraping, supaya laporan tidak salah sasaran ketika sumbernya di-scrape ulang.';
comment on column titik_parkir.presisi is
  'jalan = koordinat dipakai lebih dari satu alamat, jadi pin mewakili ruas jalan. perkiraan = koordinat hanya dipakai alamat ini. Nilai "exact" tidak pernah dipakai: tidak ada buktinya.';

do $$
begin
  alter table titik_parkir
    add constraint titik_parkir_presisi_check check (presisi in ('jalan', 'perkiraan'));
exception
  when duplicate_object then null;
end
$$;

-- Kunci yang dipakai ON CONFLICT di bawah, sekaligus penjaga supaya seed ulang
-- tidak menggandakan baris.
create unique index if not exists titik_parkir_kode_titik_idx
  on titik_parkir (kode_titik);

-- kategori_tarif, sumber_kategori, progresif, wilayah_id, dan geocode_akurasi
-- sengaja dibiarkan null. Perda 7/2023 tidak memetakan alamat ke kategori
-- tarif, jadi kita memang BELUM tahu tarif titik-titik ini. Mengisi nilai
-- bawaan berarti menerbitkan angka yang tidak bisa ditelusuri.
insert into titik_parkir
  (kode_titik, alamat, landmark, jam_jaga, jam_mulai, jam_selesai, presisi, geom)
values
${nilai}
on conflict (kode_titik) do update set
  alamat      = excluded.alamat,
  landmark    = excluded.landmark,
  jam_jaga    = excluded.jam_jaga,
  jam_mulai   = excluded.jam_mulai,
  jam_selesai = excluded.jam_selesai,
  presisi     = excluded.presisi,
  geom        = excluded.geom;

commit;
`;

  mkdirSync(dirname(BERKAS_SQL), { recursive: true });
  writeFileSync(BERKAS_SQL, sql, "utf8");
}

function cetakRingkasan(titik, jumlahPerKoordinat, daftarKembar) {
  const jalan = titik.filter((t) => t.presisi === "jalan").length;
  const perkiraan = titik.length - jalan;
  const jamGagal = titik.filter((t) => t.jamMulai === null);

  if (daftarKembar.length > 0) {
    console.log(`\nBaris kembar — dipertahankan, silakan cek manual (${daftarKembar.length} kelompok):`);
    for (const { jumlah, anggota } of daftarKembar) {
      const identik = anggota.every(
        (a) => a.jamTeks === anggota[0].jamTeks && a.koordinat === anggota[0].koordinat,
      );
      console.log(
        `  ${jumlah}x  ${identik ? "identik penuh " : "beda jam/koord"}  ` +
          `${anggota[0].alamat} — ${anggota[0].lokasi}`,
      );
      if (!identik) {
        for (const a of anggota) console.log(`         id=${a.id}  jam="${a.jamTeks}"  ${a.koordinat}`);
      }
    }
  }

  const varianGagal = [...new Set(jamGagal.map((t) => t.jamTeks))];
  if (varianGagal.length > 0) {
    console.log(`\nJam jaga yang tidak bisa diparse — disimpan apa adanya di jam_teks, jam_mulai/selesai null:`);
    for (const v of varianGagal) {
      const n = jamGagal.filter((t) => t.jamTeks === v).length;
      console.log(`  ${String(n).padStart(3)}x  "${v}"`);
    }
  }

  const terpadat = [...jumlahPerKoordinat.entries()].sort((a, b) => b[1] - a[1])[0];
  const contohTerpadat = titik.find((t) => t.koordinat === terpadat[0]);

  console.log(`
=== RINGKASAN ===
  total titik            : ${titik.length}
  koordinat unik         : ${jumlahPerKoordinat.size}
  presisi 'jalan'        : ${jalan}
  presisi 'perkiraan'    : ${perkiraan}
  jam gagal diparse      : ${jamGagal.length} baris (${varianGagal.length} varian)
  koordinat terpadat     : ${terpadat[1]} alamat di ${terpadat[0]} (${contohTerpadat.alamat})

  ditulis:
    public/data/titik-parkir.geojson
    supabase/migrations/0002_seed_titik.sql
`);
}

utama();
