-- =============================================================
-- 0001_init.sql
-- Skema awal — Transparansi Tarif Parkir Surabaya
-- Jalankan di Supabase SQL Editor, atau via Supabase CLI.
-- =============================================================

create extension if not exists postgis;


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
-- tabel ini hanya menyimpan peran dan wilayah.
-- -------------------------------------------------------------
create table petugas (
  id          uuid primary key references auth.users(id) on delete cascade,
  nama        text not null,
  peran       text not null check (peran in ('dishub', 'katar')),
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