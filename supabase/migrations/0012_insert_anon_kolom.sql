-- =====================================================================
-- 0012 — Batasi KOLOM yang boleh diisi saat mengirim laporan
--
-- Menutup lubang yang ada sejak 0001. Policy "kirim anonim"
-- (0001_init.sql:192) berbunyi:
--
--     create policy "kirim anonim" on laporan for insert with check (true);
--
-- Policy itu benar dan tetap dibiarkan apa adanya: siapa pun memang boleh
-- mengirim laporan tanpa akun, dan itu inti dari fitur ini. Yang hilang
-- adalah lapis kedua — RLS menjawab "baris ini boleh masuk?", ia tidak
-- pernah menjawab "kolom ini boleh diisi oleh pengirimnya?". Pertanyaan
-- kedua dijawab oleh privilege kolom, dan privilege itu belum pernah
-- dipasang untuk INSERT.
--
-- Akibatnya, sampai migrasi ini dijalankan, pemegang kunci anon — dan kunci
-- itu memang ada di bundel peramban, sebagaimana mestinya — bisa mengisi
-- kolom yang seharusnya hanya milik petugas:
--
--     status              -> langsung 'selesai' atau 'ditolak'
--     tindak_lanjut       -> teks bebas apa pun
--     ditangani_oleh      -> uuid petugas mana pun
--     status_diubah_pada  -> stempel waktu palsu
--     dibuat_pada         -> tanggal mundur
--
-- Kolom tindak_lanjut adalah satu-satunya teks bebas di seluruh basis data
-- yang mengalir dari petugas ke publik (lihat comment-nya di 0006). Ia
-- ditampilkan apa adanya oleh cek_status_laporan() di halaman publik
-- /warga/cek/[kode]. Menulisinya dari luar berarti menerbitkan kalimat yang
-- terbaca sebagai jawaban resmi Dishub, di halaman aplikasi ini sendiri.
--
-- 0006 sudah melakukan hal yang tepat untuk UPDATE oleh authenticated:
-- revoke seluruh tabel, lalu grant empat kolom saja (0006:148-150). Migrasi
-- ini memasang perlakuan yang sama untuk INSERT.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cabut privilege INSERT tingkat tabel
--
-- Ini yang bawaan Supabase berikan ke anon dan authenticated saat proyek
-- dibuat. Selama masih ada, grant per-kolom di bawah tidak berarti apa-apa:
-- privilege tabel penuh sudah mencakup setiap kolom.
--
-- authenticated ikut dicabut, bukan hanya anon. Petugas yang sedang login
-- lalu membuka /warga dan mengirim laporan berjalan sebagai authenticated,
-- bukan anon — tanpa baris ini, jalur itu tetap terbuka lebar.
-- ---------------------------------------------------------------------
revoke insert on laporan from anon;
revoke insert on laporan from authenticated;


-- ---------------------------------------------------------------------
-- 2. Kembalikan HANYA kolom yang memang dikirim formulir warga
--
-- Daftarnya diambil persis dari satu-satunya INSERT ke tabel ini di seluruh
-- aplikasi, src/app/warga/actions.ts:161-172. Kalau suatu saat formulirnya
-- menambah kolom, INSERT-nya akan gagal dengan 42501 dan daftar ini harus
-- ikut diperbarui — kegagalan yang berisik seperti itu justru yang
-- diinginkan, jauh lebih baik daripada kolom baru yang diam-diam bisa
-- diisi siapa saja.
--
-- Yang sengaja TIDAK ada di daftar, dan alasannya:
--
--   status, tindak_lanjut, ditangani_oleh, status_diubah_pada
--       Milik petugas. Inilah lubang yang ditutup migrasi ini. Keempatnya
--       tetap bisa diubah petugas lewat grant UPDATE di 0006.
--   dibuat_pada
--       Punya default now(). Tanpa grant, default itu yang dipakai dan
--       tidak bisa ditawar oleh pengirim.
--   id
--       serial; sama, defaultnya yang berlaku.
--   titik_id, wilayah_id, geohash7, tarif_diminta
--       Peninggalan skema 0001 yang tidak lagi diisi siapa pun sejak 0004
--       memindahkan jalur A ke titik_kode dan RLS ke bagian_kota.
-- ---------------------------------------------------------------------
grant insert (
  jalur,
  titik_kode,
  lokasi,
  bagian_kota,
  jenis,
  jenis_kendaraan,
  waktu_kejadian,
  catatan,
  foto_path,
  kode
) on laporan to anon, authenticated;


comment on column laporan.status is
  'Milik petugas. Sejak 0012 anon tidak punya privilege INSERT atas kolom ini; baris baru selalu masuk sebagai default ''baru''.';
