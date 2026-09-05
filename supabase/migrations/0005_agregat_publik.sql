-- =============================================================
-- 0005_agregat_publik.sql
-- Memperbaiki dua view agregat publik dari 0001 agar cocok dengan kolom yang
-- benar-benar diisi sejak 0004.
--
-- Kenapa DROP lalu CREATE, bukan CREATE OR REPLACE: nama kolomnya berubah
-- (titik_id -> titik_kode, wilayah_id -> bagian_kota), dan Postgres menolak
-- CREATE OR REPLACE VIEW yang mengganti nama kolom dengan
-- "cannot change name of view column". GRANT-nya ikut hilang saat di-drop,
-- jadi dipasang ulang di bawah.
-- =============================================================

begin;

drop view if exists laporan_agregat_titik;
drop view if exists laporan_agregat_wilayah;


-- -------------------------------------------------------------
-- Jumlah laporan per TITIK PARKIR RESMI.
--
-- Yang dijamin view ini: hanya angka keluar dari sini. Tidak ada catatan
-- pelapor, tidak ada foto, tidak ada koordinat presisi, tidak ada waktu
-- kejadian — jadi tidak ada apa pun yang perlu dimoderasi sebelum dipublikasi,
-- dan tidak ada yang bisa dipakai untuk menebak siapa pelapornya.
--
-- security_invoker = false membuat view berjalan sebagai pemiliknya, sehingga
-- RLS tabel laporan dilewati DI DALAM view ini saja. Itulah yang membuat kunci
-- anon bisa membaca ANGKA tanpa pernah bisa membaca satu baris laporan pun.
--
-- status <> 'ditolak': laporan yang sudah diperiksa petugas dan tidak terbukti
-- tidak boleh ikut dihitung. Menampilkannya berarti menerbitkan tuduhan yang
-- sudah gugur.
-- -------------------------------------------------------------
create view laporan_agregat_titik
with (security_invoker = false) as
select
  titik_kode,
  jenis,
  count(*)::int as jumlah
from laporan
where jalur = 'terdaftar'
  and titik_kode is not null
  and status <> 'ditolak'
  and dibuat_pada > now() - interval '30 days'
group by titik_kode, jenis;


-- -------------------------------------------------------------
-- Jumlah laporan di LOKASI YANG TIDAK TERDAFTAR, dikelompokkan per wilayah.
--
-- Dikelompokkan per bagian_kota (5 wilayah), bukan per kecamatan: untuk laporan
-- jalur luar_daftar kita hanya punya koordinat pin, dan tanpa poligon kecamatan
-- satu-satunya pengelompokan yang bisa diturunkan adalah lima wilayah lewat
-- ambang kasar. Setiap tampilan yang memakai angka ini wajib menyebut bahwa
-- pengelompokannya perkiraan, bukan batas administratif resmi.
--
-- Pengelompokan per wilayah juga yang membuat angka ini aman dipublikasikan:
-- koordinat persis pin tidak pernah ikut keluar.
-- -------------------------------------------------------------
create view laporan_agregat_wilayah
with (security_invoker = false) as
select
  bagian_kota,
  jenis,
  count(*)::int as jumlah
from laporan
where jalur = 'luar_daftar'
  and bagian_kota is not null
  and status <> 'ditolak'
  and dibuat_pada > now() - interval '30 days'
group by bagian_kota, jenis;


-- Hak baca dipasang ulang: DROP VIEW menghapusnya bersama view lama.
grant select on laporan_agregat_titik   to anon, authenticated;
grant select on laporan_agregat_wilayah to anon, authenticated;

commit;
