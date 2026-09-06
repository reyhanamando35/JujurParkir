-- =============================================================
-- 0011_atribut_titik.sql
--
-- Membuka jalan bagi Dishub menetapkan atribut per titik parkir:
-- kategori tarifnya apa, dan apakah titik itu menerapkan tarif progresif.
--
-- Sampai sekarang `titik_parkir` hanya punya policy "baca publik" untuk SELECT.
-- Tidak ada satu pun policy tulis, jadi lewat API tidak ada yang bisa mengubah
-- kolom kategori_tarif maupun progresif — termasuk petugas yang sudah masuk.
--
-- Sekalian menutup bahaya seed ulang. Lihat bagian 2.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. HAK TULIS UNTUK DISHUB
--
-- Yang dijamin:
--   * Hanya peran 'dishub' yang bisa mengubah. Katar TIDAK — kategori tarif
--     mengikuti Perda dan berlaku sekota, bukan wewenang koordinator wilayah.
--   * Warga (anon) tetap hanya membaca. Policy "baca publik" dari 0001 tidak
--     disentuh: daftar titik parkir memang harus terbuka.
--   * Hanya TIGA kolom yang boleh disentuh. Policy menentukan baris, grant
--     kolom menentukan kolom — tanpa grant ini, Dishub yang sudah masuk bisa
--     menulis ulang alamat atau menggeser koordinat titik langsung dari konsol
--     peramban, dan itu akan diam-diam berbeda dari GeoJSON yang menggambar
--     peta.
-- -------------------------------------------------------------
drop policy if exists "dishub ubah atribut titik" on titik_parkir;
create policy "dishub ubah atribut titik" on titik_parkir
  for update to authenticated
  using (
    exists (select 1 from petugas p where p.id = auth.uid() and p.peran = 'dishub')
  )
  with check (
    exists (select 1 from petugas p where p.id = auth.uid() and p.peran = 'dishub')
  );

revoke update on titik_parkir from authenticated;
grant update (kategori_tarif, sumber_kategori, progresif)
  on titik_parkir to authenticated;


-- -------------------------------------------------------------
-- 2. PENANDA BARIS USANG
--
-- Kenapa ini perlu: kode_titik dihitung dari sha256(alamat|lokasi). Data
-- alamatnya masih kotor dan akan dibersihkan, dan begitu teks alamatnya
-- berubah, HASH-NYA IKUT BERUBAH.
--
-- Akibatnya saat seed berikutnya dijalankan:
--   * baris dengan kode baru MASUK sebagai baris baru, kategorinya null lagi
--   * baris lama TIDAK ikut terhapus — 0002 hanya insert dan update
--   * kategori dan penanda progresif yang sudah ditetapkan petugas tertinggal
--     di baris lama yang tidak lagi menggambar apa pun di peta
--   * laporan yang menunjuk kode lama ikut menggantung
--
-- Kolom ini tidak mencegahnya, tapi membuatnya KELIHATAN. Baris yang tidak ada
-- di seed terbaru ditandai nonaktif, sehingga bisa dihitung, ditinjau, dan
-- kategorinya dipindahkan — bukan hilang diam-diam.
--
-- Yang MENGISI kolom ini adalah 0002_seed_titik.sql, yang sejak sekarang
-- menandai sendiri baris yang tidak muncul lagi di seed. Kolomnya ditambahkan
-- di kedua berkas — 0002 berjalan lebih dulu menurut urutan nama, dan migrasi
-- ini tetap harus berdiri sendiri untuk basis data yang 0002-nya sudah telanjur
-- berjalan dalam bentuk lama. Keduanya idempoten, jadi urutan mana pun aman.
-- -------------------------------------------------------------
alter table titik_parkir add column if not exists nonaktif boolean not null default false;

comment on column titik_parkir.nonaktif is
  'true = kode_titik ini tidak ada lagi di seed terbaru, biasanya karena teks alamatnya berubah sehingga hash-nya bergeser. Barisnya sengaja tidak dihapus supaya kategori, penanda progresif, dan laporan yang menunjuknya masih bisa ditinjau dan dipindahkan.';

create index if not exists titik_parkir_nonaktif_idx on titik_parkir (nonaktif);

commit;
