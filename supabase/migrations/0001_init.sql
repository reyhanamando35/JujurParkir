-- =============================================================
-- 0001_init.sql
-- Skema awal — Transparansi Tarif Parkir Surabaya
-- Jalankan di Supabase SQL Editor, atau via Supabase CLI.
-- =============================================================

create extension if not exists postgis;

-- pgcrypto menyediakan crypt() + gen_salt() yang dipakai seeder petugas
-- di bagian paling bawah untuk membuat hash bcrypt.
create extension if not exists pgcrypto with schema extensions;


-- -------------------------------------------------------------
-- WILAYAH (kecamatan)
-- Basis pembagian kerja Katar. Diturunkan secara geografis dari
-- koordinat titik parkir, BUKAN dari tabel penugasan jukir
-- (tabel itu berisi data pribadi dan tidak diambil).
-- -------------------------------------------------------------
create table wilayah (
  id    serial primary key,
  nama  text not null unique
);


-- -------------------------------------------------------------
-- TITIK PARKIR
-- 1.353 titik dari dashboard Dishub, diperkaya koordinat via ETL.
-- -------------------------------------------------------------
create table titik_parkir (
  id               serial primary key,
  kode_sumber      text,          -- id asli di dashboard Dishub, untuk telusur balik
  alamat           text not null,
  landmark         text,
  jam_jaga         text,
  wilayah_id       int references wilayah(id),

  geom             geography(Point, 4326),
  geocode_akurasi  text check (geocode_akurasi in
                     ('exact', 'jalan', 'kecamatan', 'gagal')),

  -- Sengaja nullable. Pemetaan titik -> kategori tarif tidak ada di
  -- Perda 7/2023. Bila gagal ditemukan, UI menampilkan rentang
  -- Rp1.000-Rp3.500 dan menyatakan kategorinya belum dipublikasikan.
  kategori_tarif   text check (kategori_tarif in
                     ('non_zona', 'zona', 'insidentil', 'petak_khusus')),
  sumber_kategori  text check (sumber_kategori in
                     ('perda', 'kepwal', 'uptd', 'belum_verif')),

  -- NULL = belum diketahui apakah titik ini sudah bersistem elektronik
  progresif        boolean,

  dibuat_pada      timestamptz not null default now()
);

create index titik_parkir_geom_idx    on titik_parkir using gist (geom);
create index titik_parkir_wilayah_idx on titik_parkir (wilayah_id);


-- -------------------------------------------------------------
-- TARIF
-- Diseed dari Perda 7/2023. Kolom `sumber` wajib diisi rujukan
-- pasal/lampiran — setiap angka harus bisa ditelusuri.
-- -------------------------------------------------------------
create table tarif (
  id               serial primary key,
  kategori         text not null,
  jenis_kendaraan  text not null,
  mode             text not null check (mode in ('progresif', 'non_progresif')),
  tarif_awal       int,
  tarif_per_jam    int,
  tarif_maks       int,
  sumber           text not null,   -- cth: 'Perda 7/2023 Lampiran I huruf C'
  unique (kategori, jenis_kendaraan, mode)
);


-- -------------------------------------------------------------
-- PETUGAS
-- Terhubung ke Supabase Auth. Password ditangani auth.users,
-- tabel ini hanya menyimpan identitas dan peran.
--
-- TIDAK ADA kolom password di sini. Hash bcrypt-nya tinggal di
-- auth.users.encrypted_password dan hanya GoTrue yang memverifikasi.
-- Menyimpan hash kedua di tabel ini berarti dua sumber kebenaran
-- yang bisa berbeda isi — itu cara membuat lubang, bukan menutupnya.
-- -------------------------------------------------------------

-- Enum sungguhan, bukan text + check: nilai di luar daftar ditolak di
-- level tipe, dan tipenya bisa dipakai ulang di fungsi/RPC nanti.
create type peran_petugas as enum ('dishub', 'katar');

create table petugas (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,

  -- Disalin dari auth.users karena kunci anon TIDAK boleh membaca skema
  -- auth. Tanpa salinan ini, dasbor tidak bisa menampilkan identitas
  -- petugas yang sedang masuk. auth.users tetap sumber kebenaran login.
  email       text not null unique,

  nama        text not null,
  peran       peran_petugas not null,
  wilayah_id  int references wilayah(id),

  constraint katar_wajib_punya_wilayah check (
    peran = 'dishub' or wilayah_id is not null
  )
);


-- -------------------------------------------------------------
-- LAPORAN
-- Dua jalur:
--   terdaftar   -> lokasi dipilih dari dropdown 1.353 titik resmi
--   luar_daftar -> lokasi ditandai manual dengan pin di peta
--
-- TIDAK ADA kolom nama, telepon, email, alamat, atau nomor polisi.
-- Ini keputusan, bukan kelalaian.
-- -------------------------------------------------------------
create table laporan (
  id             serial primary key,
  jalur          text not null check (jalur in ('terdaftar', 'luar_daftar')),

  titik_id       int  references titik_parkir(id),   -- hanya jalur 'terdaftar'
  lokasi         geography(Point, 4326),             -- hanya jalur 'luar_daftar'
  geohash7       text,                               -- agregasi publik ~150 m
  wilayah_id     int  references wilayah(id),        -- untuk RLS Katar

  jenis          text not null check (jenis in (
                   'tarif_lebih',
                   'tanpa_karcis',
                   'parkir_liar',
                   'pungutan_area_gratis',
                   'perilaku'
                 )),
  tarif_diminta  int,

  catatan        text,        -- opsional. TIDAK PERNAH tampil publik.
  foto_path      text,        -- path di Supabase Storage (bucket privat)

  status         text not null default 'baru'
                 check (status in ('baru', 'proses', 'selesai', 'ditolak')),
  ditangani_oleh uuid references petugas(id),
  dibuat_pada    timestamptz not null default now(),

  -- Menjamin tidak ada laporan setengah jadi yang masuk.
  constraint jalur_konsisten check (
    (jalur = 'terdaftar'   and titik_id is not null and lokasi   is null) or
    (jalur = 'luar_daftar' and lokasi   is not null and titik_id is null)
  )
);

create index laporan_titik_idx    on laporan (titik_id);
create index laporan_wilayah_idx  on laporan (wilayah_id);
create index laporan_geohash_idx  on laporan (geohash7);
create index laporan_tanggal_idx  on laporan (dibuat_pada desc);
create index laporan_lokasi_idx   on laporan using gist (lokasi);


-- -------------------------------------------------------------
-- KUOTA (rate limit)
-- id_hash = sha256(ip + salt_harian). IP asli tidak pernah disimpan.
-- -------------------------------------------------------------
create table kuota (
  id_hash  text not null,
  tanggal  date not null,
  jumlah   int  not null default 0,
  primary key (id_hash, tanggal)
);


-- =============================================================
-- ROW LEVEL SECURITY
-- Tanpa ini, kunci anon bisa membaca SELURUH isi tabel.
-- =============================================================

alter table titik_parkir enable row level security;
alter table tarif        enable row level security;
alter table wilayah      enable row level security;
alter table laporan      enable row level security;
alter table petugas      enable row level security;
alter table kuota        enable row level security;

-- Data referensi: publik, baca saja.
create policy "baca publik" on titik_parkir for select using (true);
create policy "baca publik" on tarif        for select using (true);
create policy "baca publik" on wilayah      for select using (true);

-- Laporan: siapa pun boleh mengirim, TIDAK ADA yang boleh membaca
-- lewat kunci anon. Angka publik disajikan lewat view agregat.
create policy "kirim anonim" on laporan for insert with check (true);

-- Petugas membaca laporan: Dishub semua, Katar hanya wilayahnya.
create policy "petugas baca laporan" on laporan for select using (
  exists (
    select 1 from petugas p
    where p.id = auth.uid()
      and (p.peran = 'dishub' or p.wilayah_id = laporan.wilayah_id)
  )
);

create policy "petugas ubah laporan" on laporan for update using (
  exists (
    select 1 from petugas p
    where p.id = auth.uid()
      and (p.peran = 'dishub' or p.wilayah_id = laporan.wilayah_id)
  )
);

-- Petugas hanya bisa melihat barisnya sendiri.
create policy "baca diri sendiri" on petugas for select using (id = auth.uid());

-- Kuota tidak pernah diakses dari klien — hanya lewat service role,
-- yang melewati RLS. Tidak ada policy = tertutup total.


-- =============================================================
-- VIEW AGREGAT PUBLIK
-- Hanya angka. Tidak ada teks bebas, foto, atau koordinat presisi,
-- sehingga tidak ada yang perlu dimoderasi.
-- =============================================================

create view laporan_agregat_titik
with (security_invoker = false) as
select
  titik_id,
  jenis,
  count(*)::int as jumlah
from laporan
where jalur = 'terdaftar'
  and dibuat_pada > now() - interval '30 days'
group by titik_id, jenis;

create view laporan_agregat_wilayah
with (security_invoker = false) as
select
  wilayah_id,
  jenis,
  count(*)::int as jumlah
from laporan
where jalur = 'luar_daftar'
  and dibuat_pada > now() - interval '30 days'
group by wilayah_id, jenis;

grant select on laporan_agregat_titik   to anon, authenticated;
grant select on laporan_agregat_wilayah to anon, authenticated;


-- =============================================================
-- SEED — 31 kecamatan Surabaya
-- Verifikasi ulang daftar ini terhadap sumber resmi sebelum dipakai.
-- =============================================================

insert into wilayah (nama) values
  ('Asemrowo'), ('Benowo'), ('Bubutan'), ('Bulak'), ('Dukuh Pakis'),
  ('Gayungan'), ('Genteng'), ('Gubeng'), ('Gunung Anyar'), ('Jambangan'),
  ('Karang Pilang'), ('Kenjeran'), ('Krembangan'), ('Lakarsantri'),
  ('Mulyorejo'), ('Pabean Cantian'), ('Pakal'), ('Rungkut'),
  ('Sambikerep'), ('Sawahan'), ('Semampir'), ('Simokerto'),
  ('Sukolilo'), ('Sukomanunggal'), ('Tambaksari'), ('Tandes'),
  ('Tegalsari'), ('Tenggilis Mejoyo'), ('Wiyung'), ('Wonocolo'),
  ('Wonokromo');

-- =============================================================
-- SEED — AKUN PETUGAS (HANYA UNTUK PENGEMBANGAN)
--
-- PERINGATAN: kata sandi di bawah ini tersimpan di dalam repositori,
-- jadi ia TIDAK RAHASIA. Jangan pernah menjalankan blok ini pada basis
-- data produksi. Sebelum rilis: hapus blok ini, atau ganti setiap kata
-- sandinya lewat Supabase Auth.
--
-- Kata sandi TIDAK disimpan sebagai kolom di tabel petugas. Ia masuk ke
-- auth.users.encrypted_password sebagai hash bcrypt (crypt + gen_salt
-- 'bf' cost 10) — algoritma yang sama dengan yang dipakai GoTrue, jadi
-- akun hasil seed ini bisa dipakai login seperti akun biasa.
--
--   admin@dishub.com         / Dishub#2026   -> peran dishub
--   katar.genteng@katar.com  / Katar#2026    -> peran katar (Genteng)
--
-- Idempoten: aman dijalankan ulang, tidak akan menggandakan akun.
-- =============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated',
   'admin@dishub.com',
   extensions.crypt('Dishub#2026', extensions.gen_salt('bf', 10)),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb,
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated',
   'katar.genteng@katar.com',
   extensions.crypt('Katar#2026', extensions.gen_salt('bf', 10)),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb,
   '', '', '', '')
on conflict (id) do nothing;


-- GoTrue menolak login akun email yang tidak punya baris identitas.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub',            u.id::text,
    'email',          u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where u.email in ('admin@dishub.com', 'katar.genteng@katar.com')
on conflict do nothing;


insert into petugas (id, username, email, nama, peran, wilayah_id)
values
  ('11111111-1111-4111-8111-111111111111',
   'admin_dishub', 'admin@dishub.com',
   'Admin Dishub', 'dishub', null),

  ('22222222-2222-4222-8222-222222222222',
   'katar_genteng', 'katar.genteng@katar.com',
   'Koordinator Wilayah Genteng', 'katar',
   (select id from wilayah where nama = 'Genteng'))
on conflict (id) do nothing;
