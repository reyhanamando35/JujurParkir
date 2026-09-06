-- =============================================================
-- 0007_agregat_terbuka.sql
--
-- Sampai 0005, view agregat hanya menyingkirkan laporan berstatus 'ditolak'.
-- Akibatnya laporan yang sudah ditandai SELESAI oleh petugas tetap terhitung
-- di peta warga selama 30 hari — titik yang masalahnya sudah beres tetap
-- tertempel angka, dan popup masih menulis "belum diverifikasi petugas"
-- padahal sudah.
--
-- Yang diubah: view kini memisahkan dua angka.
--
--   jumlah_terbuka — laporan yang masih 'baru' atau 'proses'.
--                    Ini yang jadi angka di lingkaran peta: yang masih
--                    menunggu ditindaklanjuti.
--   jumlah_total   — seluruh laporan 30 hari terakhir kecuali 'ditolak'.
--                    Ini yang dipakai popup, supaya jejaknya tidak hilang.
--
-- Kenapa 'selesai' tidak dihapus sama sekali: titik yang dilaporkan sepuluh
-- kali lalu diselesaikan sepuluh kali akan terlihat sama bersihnya dengan
-- titik yang tidak pernah dilaporkan. Angka di lingkaran boleh bersih —
-- riwayatnya tidak boleh hilang.
--
-- 'ditolak' tetap dibuang dari keduanya: sudah diperiksa dan tidak terbukti,
-- jadi tidak boleh diterbitkan sebagai tuduhan dalam bentuk apa pun.
--
-- DROP lalu CREATE, bukan CREATE OR REPLACE: nama kolomnya berubah, dan
-- Postgres menolak penggantian nama kolom pada replace. GRANT ikut hilang saat
-- di-drop, jadi dipasang ulang di bawah.
-- =============================================================

begin;

drop view if exists laporan_agregat_titik;
drop view if exists laporan_agregat_wilayah;


-- -------------------------------------------------------------
-- Per TITIK PARKIR RESMI.
--
-- security_invoker = false dipertahankan: view berjalan sebagai pemiliknya,
-- sehingga RLS tabel laporan dilewati DI DALAM view ini saja. Itulah yang
-- membuat kunci anon bisa membaca ANGKA tanpa pernah bisa membaca satu baris
-- laporan pun.
--
-- Pengelompokan per `jenis` dibuang — tidak ada satu pun pembaca yang
-- memakainya, dan mempertahankannya berarti memaksa setiap pembaca
-- menjumlahkan sendiri sebelum bisa memakai angkanya.
-- -------------------------------------------------------------
create view laporan_agregat_titik
with (security_invoker = false) as
select
  titik_kode,
  count(*) filter (where status in ('baru', 'proses'))::int as jumlah_terbuka,
  count(*)::int as jumlah_total
from laporan
where jalur = 'terdaftar'
  and titik_kode is not null
  and status <> 'ditolak'
  and dibuat_pada > now() - interval '30 days'
group by titik_kode;


-- -------------------------------------------------------------
-- Per WILAYAH, untuk laporan di lokasi yang tidak terdaftar.
-- Koordinat persis pin tidak pernah ikut keluar dari sini.
-- -------------------------------------------------------------
create view laporan_agregat_wilayah
with (security_invoker = false) as
select
  bagian_kota,
  count(*) filter (where status in ('baru', 'proses'))::int as jumlah_terbuka,
  count(*)::int as jumlah_total
from laporan
where jalur = 'luar_daftar'
  and bagian_kota is not null
  and status <> 'ditolak'
  and dibuat_pada > now() - interval '30 days'
group by bagian_kota;


grant select on laporan_agregat_titik   to anon, authenticated;
grant select on laporan_agregat_wilayah to anon, authenticated;

commit;
