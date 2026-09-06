-- =============================================================
-- 0008_tarif_kelola.sql
--
-- Tabel `tarif` sudah ada sejak 0001 dan sampai sekarang tidak pernah dipakai:
-- nol baris, dan aplikasi membaca konstanta di src/lib/tarif.ts. Migrasi ini
-- membuka jalan menulisnya lewat aplikasi, bukan cuma lewat Table Editor.
--
-- Sampai sekarang satu-satunya policy di tabel itu adalah "baca publik" untuk
-- SELECT. Artinya lewat API TIDAK ADA yang bisa menulis — termasuk petugas yang
-- sudah masuk. Table Editor Supabase bisa hanya karena ia berjalan sebagai
-- postgres, yang melewati RLS sepenuhnya.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- Yang dijamin tiga policy di bawah:
--
--   * Hanya petugas berperan 'dishub' yang bisa menulis tarif. Katar TIDAK,
--     sekalipun ia sudah masuk dan memegang JWT-nya sendiri — tarif berlaku
--     sekota, jadi tidak boleh ditetapkan oleh koordinator satu wilayah.
--   * Warga (anon) tetap hanya bisa membaca. Policy "baca publik" dari 0001
--     tidak disentuh: angka tarif memang harus terbuka untuk siapa saja.
--   * Pemeriksaannya ada di sini, bukan di Server Action. Kalau Katar mencoba
--     menyimpan lewat konsol peramban, Postgres yang menolaknya.
-- -------------------------------------------------------------

drop policy if exists "dishub tambah tarif" on tarif;
create policy "dishub tambah tarif" on tarif
  for insert to authenticated
  with check (
    exists (
      select 1 from petugas p
      where p.id = auth.uid() and p.peran = 'dishub'
    )
  );

drop policy if exists "dishub ubah tarif" on tarif;
create policy "dishub ubah tarif" on tarif
  for update to authenticated
  using (
    exists (
      select 1 from petugas p
      where p.id = auth.uid() and p.peran = 'dishub'
    )
  )
  with check (
    exists (
      select 1 from petugas p
      where p.id = auth.uid() and p.peran = 'dishub'
    )
  );

drop policy if exists "dishub hapus tarif" on tarif;
create policy "dishub hapus tarif" on tarif
  for delete to authenticated
  using (
    exists (
      select 1 from petugas p
      where p.id = auth.uid() and p.peran = 'dishub'
    )
  );


-- -------------------------------------------------------------
-- Policy menentukan BARIS mana yang boleh disentuh; hak tabel menentukan
-- apakah perannya boleh menyentuh tabelnya sama sekali. Keduanya perlu.
--
-- Sequence ikut diberikan: tanpa itu INSERT gagal saat mengambil nilai `id`
-- berikutnya, dengan galat yang sama sekali tidak menyebut sequence.
-- -------------------------------------------------------------
grant insert, update, delete on tarif to authenticated;
grant usage, select on sequence tarif_id_seq to authenticated;


comment on table tarif is
  'Tarif rujukan Perda. Ditulis hanya oleh petugas Dishub lewat /petugas/tarif, dibaca siapa saja termasuk warga tanpa akun. Kolom sumber wajib diisi rujukan pasal/lampiran — setiap angka harus bisa ditelusuri.';

commit;
