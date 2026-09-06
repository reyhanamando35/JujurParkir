-- =============================================================
-- 0009_kategori_tarif.sql
--
-- Menyatukan kosakata kategori tarif, lalu menghubungkan tabel `tarif` dengan
-- `titik_parkir` lewat tabel referensi.
--
-- Sebelum ini kosakatanya hidup di DUA tempat yang berbeda ketatnya:
--   titik_parkir.kategori_tarif — punya CHECK (non_zona, zona, insidentil,
--                                 petak_khusus)
--   tarif.kategori              — `text not null` polos, tanpa CHECK sama
--                                 sekali
-- Artinya mengetik 'Zona' atau 'non-zona' di tabel tarif diterima basis data
-- tanpa keluhan, ikut melebarkan rentang yang tampil ke warga, tapi tidak akan
-- pernah cocok dengan titik mana pun. Gagal diam-diam — jenis kesalahan yang
-- paling sulit ketahuan.
--
-- Sekarang kosakatanya cuma satu: tabel `kategori_tarif`, dan kedua tabel itu
-- menunjuk ke sana lewat foreign key.
--
-- KOLOM `mode` TIDAK DISENTUH. Ia tetap NOT NULL, tetap dengan CHECK
-- (progresif / non_progresif), dan tetap menjadi bagian kunci unik bersama
-- kategori dan jenis kendaraan. Jadi satu kategori masih bisa punya baris
-- progresif dan non-progresif sekaligus kalau Perda memang membedakannya.
--
-- Aman dijalankan sekarang: tabel `tarif` dan `titik_parkir` sama-sama nol
-- baris, jadi tidak ada data lama yang bisa menggagalkan constraint baru.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. TABEL REFERENSI
--
-- Satu-satunya tempat daftar kategori ditulis. Ditambah atau diubah lewat
-- migrasi, bukan lewat aplikasi: kategori tarif berasal dari Perda, dan
-- menambahnya adalah keputusan hukum, bukan operasional.
-- -------------------------------------------------------------
create table if not exists kategori_tarif (
  kode    text primary key,
  nama    text not null,
  urutan  int  not null default 0
);

insert into kategori_tarif (kode, nama, urutan) values
  ('non_zona',  'Non-zona',  1),
  ('zona',      'Zona',      2),
  ('progresif', 'Progresif', 3)
on conflict (kode) do update
  set nama = excluded.nama, urutan = excluded.urutan;

alter table kategori_tarif enable row level security;

-- Daftar kategori memang harus terbuka: warga perlu tahu kategori apa saja
-- yang ada untuk memahami rentang tarif di peta. Tidak ada policy tulis sama
-- sekali — bahkan Dishub tidak bisa menambah kategori lewat aplikasi.
drop policy if exists "baca publik" on kategori_tarif;
create policy "baca publik" on kategori_tarif for select using (true);


-- -------------------------------------------------------------
-- 2. titik_parkir.kategori_tarif: CHECK -> FOREIGN KEY
-- -------------------------------------------------------------
alter table titik_parkir drop constraint if exists titik_parkir_kategori_tarif_check;

-- Berjaga kalau ada nilai lama di luar kosakata baru ('insidentil',
-- 'petak_khusus'). Dikosongkan, bukan dipaksa jadi kategori lain — menebak
-- kategori sebuah titik persis yang tidak boleh dilakukan.
update titik_parkir
   set kategori_tarif = null
 where kategori_tarif is not null
   and kategori_tarif not in (select kode from kategori_tarif);

alter table titik_parkir drop constraint if exists titik_parkir_kategori_fk;
alter table titik_parkir
  add constraint titik_parkir_kategori_fk
  foreign key (kategori_tarif) references kategori_tarif(kode);


-- -------------------------------------------------------------
-- 3. tarif.kategori -> FOREIGN KEY, dan kosakata kendaraan dikunci
--
-- Kunci unik (kategori, jenis_kendaraan, mode) dari 0001 DIBIARKAN apa adanya.
-- -------------------------------------------------------------
delete from tarif where kategori not in (select kode from kategori_tarif);

alter table tarif drop constraint if exists tarif_kategori_fk;
alter table tarif
  add constraint tarif_kategori_fk
  foreign key (kategori) references kategori_tarif(kode);

-- Sisi kendaraan juga tidak pernah punya CHECK. Salah ketik di sini
-- menghasilkan baris yang ikut menghitung rentang tapi tidak pernah cocok
-- dengan kendaraan mana pun yang ditampilkan aplikasi.
alter table tarif drop constraint if exists tarif_kendaraan_check;
alter table tarif
  add constraint tarif_kendaraan_check
  check (jenis_kendaraan in ('motor', 'mobil'));


comment on table kategori_tarif is
  'Kosakata tunggal kategori tarif. tarif.kategori dan titik_parkir.kategori_tarif sama-sama menunjuk ke sini, sehingga keduanya mustahil berbeda ejaan.';

commit;
