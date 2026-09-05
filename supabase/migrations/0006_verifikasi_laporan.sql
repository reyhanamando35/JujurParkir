-- =============================================================
-- 0006_verifikasi_laporan.sql
--
-- Menutup lingkaran laporan warga. Sampai migrasi ini, laporan hanya bisa
-- MASUK: kolom `status` tidak pernah diubah siapa pun, jadi nilainya selamanya
-- 'baru' dan kode 6 karakter yang ditunjukkan ke pelapor tidak menunjuk ke
-- mana-mana.
--
-- Yang ditambahkan:
--   1. tindak_lanjut  — jawaban petugas yang DIBACA WARGA
--   2. status_diubah_pada — kapan terakhir bergerak
--   3. indeks kode    — supaya cek status tidak memindai seluruh tabel
--   4. view laporan_petugas — koordinat siap pakai, RLS tetap berlaku
--   5. fungsi cek_status_laporan — satu-satunya jalan baca untuk anon
--   6. pengetatan hak kolom UPDATE
-- =============================================================

begin;


-- -------------------------------------------------------------
-- 1 & 2. KOLOM BARU
-- -------------------------------------------------------------
alter table laporan add column if not exists tindak_lanjut text;
alter table laporan add column if not exists status_diubah_pada timestamptz;

-- Komentarnya bukan hiasan: kolom ini satu-satunya teks bebas di seluruh basis
-- data yang mengalir dari petugas ke publik. Siapa pun yang menulis kode di
-- atasnya harus tahu itu sebelum memperlakukannya sebagai catatan internal.
comment on column laporan.tindak_lanjut is
  'Jawaban petugas yang DITAMPILKAN KE WARGA lewat cek_status_laporan(). Bukan catatan internal. Tidak boleh memuat nama, kontak, atau identitas siapa pun.';
comment on column laporan.status_diubah_pada is
  'Kapan status terakhir diubah petugas. NULL berarti belum pernah ditindaklanjuti.';


-- -------------------------------------------------------------
-- 3. INDEKS KODE
-- Kode dicari satu per satu oleh warga di halaman cek status. Tanpa indeks,
-- tiap pencarian adalah seq scan seluruh tabel laporan.
--
-- Tidak dibuat unique: kodenya acak dari ruang 31^6 (~887 juta) sehingga
-- tabrakan praktis mustahil, dan constraint unique pada tabel yang sudah
-- berisi data berisiko menggagalkan seluruh migrasi karena satu baris lama.
-- -------------------------------------------------------------
create index if not exists laporan_kode_idx on laporan (kode);


-- -------------------------------------------------------------
-- 4. VIEW UNTUK PETUGAS
--
-- security_invoker = true — KEBALIKAN dari dua view agregat publik di 0005.
-- Di sana invoker sengaja false supaya anon bisa membaca angka tanpa hak baca
-- tabelnya. Di sini justru sebaliknya: view ini harus berjalan sebagai petugas
-- yang bertanya, supaya policy "petugas baca laporan" tetap menyaring —
-- Dishub sekota, Katar hanya wilayahnya. Kalau ini false, setiap petugas akan
-- melihat seluruh laporan Kota Surabaya dan pembagian wilayahnya bocor.
--
-- Alasan view ini ada sama sekali: PostgREST mengembalikan kolom geography
-- sebagai heksadesimal EWKB ('0101000020E6100000...'), yang tidak bisa dipakai
-- Leaflet. ST_Y/ST_X mengubahnya jadi angka biasa di sisi basis data.
--
-- catatan IKUT dikeluarkan di sini, dan itu disengaja: petugas tidak bisa
-- memutuskan sebuah laporan selesai atau ditolak tanpa membaca apa yang
-- dilaporkan. Yang tidak pernah ada di tabel ini sejak awal — nama, kontak,
-- IP, akun — tetap tidak ada.
-- -------------------------------------------------------------
drop view if exists laporan_petugas;

create view laporan_petugas
with (security_invoker = true) as
select
  id,
  kode,
  jalur,
  titik_kode,
  bagian_kota,
  jenis,
  jenis_kendaraan,
  catatan,
  status,
  tindak_lanjut,
  waktu_kejadian,
  dibuat_pada,
  status_diubah_pada,
  foto_path is not null as ada_foto,
  st_y(lokasi::geometry) as lat,
  st_x(lokasi::geometry) as lng
from laporan;

grant select on laporan_petugas to authenticated;


-- -------------------------------------------------------------
-- 5. CEK STATUS UNTUK WARGA
--
-- Tabel laporan tidak punya satu pun policy SELECT untuk anon, dan itu harus
-- tetap begitu. Fungsi ini satu-satunya celah baca, dan celahnya sesempit
-- mungkin: empat kolom, tidak satu pun di antaranya bisa dipakai menebak siapa
-- pelapornya atau apa isi laporannya.
--
-- Yang TIDAK PERNAH keluar dari sini: catatan (kata-kata pelapor sendiri),
-- foto_path, lokasi, titik_kode, bagian_kota.
--
-- Kodenya adalah kunci pembawa — siapa pun yang memegangnya melihat status ini.
-- Itu memang cara kerja anonimitas tanpa akun, dan aman justru karena yang
-- dikembalikan tidak lebih dari status.
--
-- set search_path = '' wajib pada fungsi security definer: tanpa itu, pemanggil
-- bisa membuat skema bayangan berisi tabel `laporan` palsu dan membajak
-- eksekusinya. Semua nama karena itu ditulis lengkap.
-- -------------------------------------------------------------
drop function if exists cek_status_laporan(text);

create function cek_status_laporan(kode_cari text)
returns table (
  status text,
  tindak_lanjut text,
  dibuat_pada timestamptz,
  status_diubah_pada timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select l.status, l.tindak_lanjut, l.dibuat_pada, l.status_diubah_pada
  from public.laporan l
  where l.kode = upper(btrim(kode_cari))
  limit 1;
$$;

revoke all on function cek_status_laporan(text) from public;
grant execute on function cek_status_laporan(text) to anon, authenticated;


-- -------------------------------------------------------------
-- 6. PENGETATAN HAK KOLOM
--
-- Policy "petugas ubah laporan" menentukan BARIS mana yang boleh disentuh.
-- Ia tidak menentukan KOLOM. Tanpa blok ini, petugas yang sudah masuk bisa
-- menulis ulang `catatan` milik warga langsung dari konsol peramban — kunci
-- anon memang ada di sana dan JWT-nya dia pegang sendiri.
--
-- Server Action kita tidak akan melakukannya, tapi keamanan yang bergantung
-- pada kode aplikasi yang berkelakuan baik bukan keamanan. Empat kolom di
-- bawah ini adalah seluruh yang perlu disentuh untuk menindaklanjuti laporan.
-- -------------------------------------------------------------
revoke update on laporan from authenticated;
grant update (status, tindak_lanjut, ditangani_oleh, status_diubah_pada)
  on laporan to authenticated;


commit;
