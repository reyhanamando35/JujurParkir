-- =============================================================
-- 0004_laporan_warga.sql
-- Kolom tambahan untuk laporan warga + bucket foto + RLS-nya.
-- 0001_init.sql tidak disentuh. Semua idempoten.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- PRASYARAT: wilayah.bagian_kota
--
-- Isinya sama dengan 0003_wilayah_rls.sql dan sengaja diulang di sini.
-- Policy di bagian bawah berkas ini membandingkan bagian_kota; kalau 0003
-- belum pernah dijalankan, seluruh berkas ini berhenti dengan
-- "column wp.bagian_kota does not exist" dan — karena dibungkus transaksi —
-- di-rollback tanpa menyisakan apa pun. Diulang di sini supaya 0004 bisa
-- ditempel sendirian dan fitur lapor langsung hidup.
--
-- Semua idempoten: menjalankan 0003 sesudah ini tidak merusak apa pun.
-- -------------------------------------------------------------
alter table wilayah add column if not exists bagian_kota text;

comment on column wilayah.bagian_kota is
  'Salah satu dari Pusat/Utara/Timur/Selatan/Barat. Dipakai RLS untuk menentukan cakupan Katar.';

update wilayah set bagian_kota = 'Pusat'
  where nama in ('Genteng', 'Bubutan', 'Tegalsari', 'Simokerto');

update wilayah set bagian_kota = 'Utara'
  where nama in ('Bulak', 'Kenjeran', 'Semampir', 'Pabean Cantian', 'Krembangan');

update wilayah set bagian_kota = 'Timur'
  where nama in ('Gubeng', 'Gunung Anyar', 'Sukolilo', 'Tambaksari',
                 'Mulyorejo', 'Rungkut', 'Tenggilis Mejoyo');

update wilayah set bagian_kota = 'Selatan'
  where nama in ('Wonokromo', 'Wonocolo', 'Wiyung', 'Karang Pilang',
                 'Jambangan', 'Gayungan', 'Dukuh Pakis', 'Sawahan');

update wilayah set bagian_kota = 'Barat'
  where nama in ('Benowo', 'Pakal', 'Asemrowo', 'Sukomanunggal',
                 'Tandes', 'Sambikerep', 'Lakarsantri');

-- Kecamatan yang belum kebagian wilayah akan membuat RLS di bawah
-- menyembunyikan laporannya dari SEMUA Katar, jadi lebih baik berhenti di sini.
do $$
declare kosong int;
begin
  select count(*) into kosong from wilayah where bagian_kota is null;
  if kosong > 0 then
    raise exception 'Masih ada % kecamatan tanpa bagian_kota.', kosong;
  end if;
end
$$;


-- -------------------------------------------------------------
-- KOLOM TAMBAHAN
-- -------------------------------------------------------------

-- Kode 8 karakter yang sama dengan titik_parkir.kode_titik dan id fitur di
-- public/data/titik-parkir.geojson.
--
-- Dipakai menggantikan titik_id: titik_id adalah FK ke titik_parkir(id) yang
-- bertipe serial, sedangkan peta di sisi warga hanya mengenal kode hash — dan
-- id serial itu bergeser setiap kali seed dijalankan ulang, yang berarti
-- laporan lama akan menunjuk titik yang keliru.
alter table laporan add column if not exists titik_kode text;

alter table laporan add column if not exists jenis_kendaraan text;
alter table laporan add column if not exists waktu_kejadian timestamptz;

-- Wilayah 5-besar (Pusat/Utara/Timur/Selatan/Barat). Tanpa kolom ini, RLS di
-- bawah tidak punya apa pun untuk dibandingkan dan laporan tidak akan pernah
-- terlihat oleh Katar mana pun.
alter table laporan add column if not exists bagian_kota text;

-- Kode acak 6 karakter yang ditunjukkan ke pelapor setelah kirim. Disimpan
-- supaya bisa dirujuk kalau pelapor menyebutkannya. TIDAK terhubung ke
-- identitas apa pun — tidak ada nama, kontak, IP, atau akun di tabel ini.
alter table laporan add column if not exists kode text;

comment on column laporan.titik_kode is
  'Kode 8 karakter titik parkir resmi (sama dengan titik_parkir.kode_titik). Diisi untuk jalur terdaftar.';
comment on column laporan.kode is
  'Kode acak 6 karakter untuk pelapor. Bukan identitas, tidak bisa ditelusuri ke orang.';

create index if not exists laporan_titik_kode_idx on laporan (titik_kode);
create index if not exists laporan_bagian_kota_idx on laporan (bagian_kota);

do $$
begin
  alter table laporan add constraint laporan_kendaraan_check
    check (jenis_kendaraan is null or jenis_kendaraan in ('motor', 'mobil'));
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table laporan add constraint laporan_bagian_kota_check
    check (bagian_kota is null or bagian_kota in
      ('Pusat', 'Utara', 'Timur', 'Selatan', 'Barat'));
exception when duplicate_object then null;
end
$$;


-- -------------------------------------------------------------
-- JENIS LAPORAN
-- Nilai lama dipertahankan supaya baris yang sudah ada tetap sah; tiga nilai
-- baru menutup pilihan yang ada di form warga.
-- -------------------------------------------------------------
alter table laporan drop constraint if exists laporan_jenis_check;

alter table laporan add constraint laporan_jenis_check check (jenis in (
  'tarif_lebih',
  'tanpa_karcis',
  'parkir_liar',
  'pungutan_area_gratis',
  'perilaku',
  'tanpa_atribut',
  'lokasi_tak_terdaftar',
  'lainnya'
));


-- -------------------------------------------------------------
-- KONSISTENSI JALUR
-- Jalur 'terdaftar' kini cukup menunjuk kode titik, bukan id serial.
-- -------------------------------------------------------------
alter table laporan drop constraint if exists jalur_konsisten;

alter table laporan add constraint jalur_konsisten check (
  (jalur = 'terdaftar'   and titik_kode is not null and lokasi     is null) or
  (jalur = 'luar_daftar' and lokasi     is not null and titik_kode is null)
);


-- -------------------------------------------------------------
-- RLS LAPORAN
--
-- Yang dijamin di sini:
--   * anon boleh MENGIRIM laporan (policy "kirim anonim" dari 0001) tetapi
--     TIDAK punya satu pun policy SELECT — jadi kunci anon tidak bisa membaca
--     laporan mana pun, termasuk yang baru saja dikirimnya sendiri. Membuka
--     Network tab tidak menolong: Postgres menolak sebelum satu byte keluar.
--   * Petugas Dishub membaca seluruh kota; Katar hanya wilayahnya. Perbandingan
--     memakai bagian_kota, bukan kecamatan, karena satu wilayah memuat beberapa
--     kecamatan dan Katar harus melihat semuanya.
--   * bagian_kota null tidak pernah lolos: perbandingan dengan null menghasilkan
--     null, bukan true.
-- -------------------------------------------------------------
drop policy if exists "petugas baca laporan" on laporan;
drop policy if exists "petugas ubah laporan" on laporan;

create policy "petugas baca laporan" on laporan for select using (
  exists (
    select 1
    from petugas p
    left join wilayah wp on wp.id = p.wilayah_id
    where p.id = auth.uid()
      and (p.peran = 'dishub' or wp.bagian_kota = laporan.bagian_kota)
  )
);

create policy "petugas ubah laporan" on laporan for update using (
  exists (
    select 1
    from petugas p
    left join wilayah wp on wp.id = p.wilayah_id
    where p.id = auth.uid()
      and (p.peran = 'dishub' or wp.bagian_kota = laporan.bagian_kota)
  )
);


-- -------------------------------------------------------------
-- BUCKET FOTO
--
-- public = false. Foto laporan bisa memuat wajah, pelat nomor, dan isi
-- dompet orang; bucket publik berarti siapa pun yang menebak nama berkas
-- bisa mengunduhnya. Petugas mengaksesnya lewat signed URL berumur pendek.
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('laporan-foto', 'laporan-foto', false)
on conflict (id) do update set public = false;

-- anon boleh menaruh foto, dan hanya itu. Tidak ada policy SELECT untuk anon,
-- jadi pengirim pun tidak bisa mengunduh kembali berkas yang baru diunggahnya.
drop policy if exists "warga kirim foto laporan" on storage.objects;
create policy "warga kirim foto laporan" on storage.objects
  for insert to anon
  with check (bucket_id = 'laporan-foto');

-- Hanya baris petugas yang boleh membaca. Warga yang sudah masuk sebagai apa
-- pun selain petugas tetap tidak lolos karena harus ada barisnya di tabel
-- petugas.
drop policy if exists "petugas baca foto laporan" on storage.objects;
create policy "petugas baca foto laporan" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'laporan-foto'
    and exists (select 1 from petugas p where p.id = auth.uid())
  );

commit;
