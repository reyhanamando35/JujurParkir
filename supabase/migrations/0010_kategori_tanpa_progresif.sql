-- =============================================================
-- 0010_kategori_tanpa_progresif.sql
--
-- Membetulkan 0009. Di sana `progresif` dimasukkan sebagai KATEGORI, sejajar
-- dengan non-zona dan zona. Angka tarif yang sebenarnya menunjukkan itu keliru:
--
--   sekali bayar : non_zona motor 3.000 / mobil 5.000
--                  zona     motor 5.000 / mobil 10.000
--   progresif    : non_zona motor 1.000 / mobil 2.000   (per jam)
--                  zona     motor 2.000 / mobil 3.000   (per jam)
--
-- Pola itu 2 kategori x 2 kendaraan x 2 mode = 8 baris. Progresif membedakan
-- CARA membayar di dalam kategori yang sama, bukan kategori tersendiri —
-- persis seperti kolom `mode` di 0001 sejak awal.
--
-- Kalau dibiarkan, 'progresif' akan jadi kategori yatim: tidak akan pernah
-- dipilih, tapi tetap muncul di dropdown formulir dan mengundang petugas
-- memasukkan baris yang tidak punya arti.
--
-- Aman: tabel `tarif` masih nol baris dan belum ada titik parkir yang punya
-- kategori, jadi tidak ada satu pun yang menunjuk baris ini.
-- =============================================================

begin;

-- Berhenti keras kalau ternyata sudah ada yang menunjuknya. Foreign key
-- sebenarnya sudah menahan, tapi galatnya menyebut nama constraint dan bukan
-- alasannya — dan orang yang menjalankan migrasi ini perlu tahu bahwa ada data
-- nyata yang harus dipindahkan lebih dulu.
do $$
declare
  jumlah_tarif int;
  jumlah_titik int;
begin
  select count(*) into jumlah_tarif from tarif where kategori = 'progresif';
  select count(*) into jumlah_titik from titik_parkir where kategori_tarif = 'progresif';

  if jumlah_tarif > 0 or jumlah_titik > 0 then
    raise exception
      'Masih ada % baris tarif dan % titik parkir berkategori progresif. Pindahkan dulu ke non_zona/zona dengan mode = progresif sebelum menjalankan migrasi ini.',
      jumlah_tarif, jumlah_titik;
  end if;
end
$$;

delete from kategori_tarif where kode = 'progresif';

commit;
