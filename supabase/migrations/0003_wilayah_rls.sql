-- =============================================================
-- 0003_wilayah_rls.sql
-- Lima wilayah Kota Surabaya + penegakan cakupan Katar di basis data.
-- 0001_init.sql tidak disentuh.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- Peta 31 kecamatan -> 5 wilayah.
--
-- Ditaruh di tabel wilayah, bukan sebagai kolom baru di petugas, supaya
-- penugasan petugas yang sudah ada (petugas.wilayah_id -> kecamatan) tetap
-- berlaku apa adanya dan tidak ada data yang perlu ditulis ulang.
-- -------------------------------------------------------------
alter table wilayah add column if not exists bagian_kota text;

comment on column wilayah.bagian_kota is
  'Salah satu dari Pusat/Utara/Timur/Selatan/Barat. Dipakai RLS untuk menentukan cakupan Katar. Berbeda dari kolom wilayah di titik_parkir yang hanya PERKIRAAN dari koordinat — yang ini pengelompokan kecamatan yang pasti.';

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

-- Menolak seed setengah jadi: kalau ada kecamatan yang belum kebagian wilayah,
-- RLS di bawah akan diam-diam menyembunyikan laporannya dari SEMUA Katar.
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
-- RLS laporan: cakupan Katar ditegakkan di sini, bukan di UI.
--
-- Yang dijamin policy ini: sebuah permintaan yang memakai kunci anon dengan
-- token seorang Katar hanya akan pernah menerima baris laporan yang wilayahnya
-- sama dengan wilayah Katar itu. Menghapus filter di klien, mengubah query di
-- Network tab, atau memanggil PostgREST langsung tidak mengubah apa pun —
-- Postgres yang menyaring, sebelum satu byte pun keluar.
--
-- Policy lama di 0001 membandingkan wilayah_id, yaitu KECAMATAN. Itu terlalu
-- sempit: seorang Katar Surabaya Pusat tidak akan melihat laporan dari
-- kecamatan lain di wilayahnya sendiri. Diganti ke perbandingan bagian_kota.
-- Aman dijalankan: tabel laporan masih kosong.
-- -------------------------------------------------------------
drop policy if exists "petugas baca laporan" on laporan;
drop policy if exists "petugas ubah laporan" on laporan;

create policy "petugas baca laporan" on laporan for select using (
  exists (
    select 1
    from petugas p
    left join wilayah wp on wp.id = p.wilayah_id
    left join wilayah wl on wl.id = laporan.wilayah_id
    where p.id = auth.uid()
      and (
        p.peran = 'dishub'
        -- Katar tanpa wilayah, atau laporan tanpa wilayah, TIDAK lolos:
        -- perbandingan dengan null menghasilkan null, bukan true.
        or wp.bagian_kota = wl.bagian_kota
      )
  )
);

create policy "petugas ubah laporan" on laporan for update using (
  exists (
    select 1
    from petugas p
    left join wilayah wp on wp.id = p.wilayah_id
    left join wilayah wl on wl.id = laporan.wilayah_id
    where p.id = auth.uid()
      and (p.peran = 'dishub' or wp.bagian_kota = wl.bagian_kota)
  )
);

-- Catatan sengaja: titik_parkir TETAP "baca publik". Peta /warga dipakai tanpa
-- akun, jadi membatasinya per wilayah akan mematikan fitur utama aplikasi ini.
-- Data titik parkir memang publik; yang rahasia adalah laporan warga di atas.

commit;
