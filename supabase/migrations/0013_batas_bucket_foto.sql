-- =====================================================================
-- 0013 — Batas ukuran dan tipe berkas pada bucket laporan-foto
--
-- Melengkapi 0004. Bucket-nya sudah private dan itu bagian yang benar;
-- yang belum dipasang adalah batas di sisi penyimpanan.
--
-- src/app/warga/actions.ts:136-145 sudah memeriksa dua hal sebelum
-- mengunggah: ukuran maksimal 10 MB dan tipe wajib image/jpeg. Pemeriksaan
-- itu berjalan di Server Action, jadi ia hanya menjaga berkas yang masuk
-- LEWAT formulir.
--
-- Yang tidak dijaganya: policy di 0004:192 mengizinkan setiap INSERT anon ke
-- bucket ini tanpa syarat selain nama bucket-nya. Pemegang kunci anon bisa
-- memanggil Storage REST langsung, melewati Server Action sepenuhnya, dan
-- menaruh berkas apa pun dengan ukuran apa pun sebanyak yang ia mau. Yang
-- habis adalah kuota penyimpanan proyek, dan tidak ada satu pun baris di
-- tabel laporan yang menandai bahwa itu terjadi.
--
-- Batas di sini sengaja disamakan persis dengan yang sudah dipakai aplikasi,
-- bukan dibuat lebih longgar "untuk jaga-jaga". Dua angka yang berbeda untuk
-- aturan yang sama berarti salah satunya pasti pernah salah.
--
--   file_size_limit    10 MB  = BATAS_FOTO_BYTE (actions.ts:36, lapor-warga.tsx:45)
--   allowed_mime_types image/jpeg saja — satu-satunya format yang pernah
--                      dikirim aplikasi, karena klien menyandikan ulang lewat
--                      Canvas untuk membuang EXIF sebelum mengirim.
-- =====================================================================

update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array['image/jpeg']
 where id = 'laporan-foto';
