-- =====================================================================
-- 0014 — Batas kirim laporan per perangkat per hari
--
-- Tiga laporan per perangkat per hari, dihitung ulang tiap tengah malam WIB.
--
-- YANG PALING PENTING DI BERKAS INI ADALAH APA YANG TIDAK ADA DI DALAMNYA:
--
--   * Tidak ada kolom IP.
--   * Tidak ada user agent, tidak ada sidik jari peramban.
--   * TIDAK ADA foreign key ke tabel laporan, dan tidak ada kolom apa pun
--     yang menyimpan id laporan.
--
-- Yang terakhir itu bukan kelalaian, itu justru intinya. Begitu tabel ini
-- punya kolom yang menunjuk sebuah laporan, siapa pun yang bisa membaca
-- keduanya bisa menyusun daftar "laporan-laporan ini dikirim dari perangkat
-- yang sama" — dan itu adalah pelacakan pelapor, persis yang dijanjikan tidak
-- ada di sistem ini. Yang tersimpan di sini hanya BERAPA, tidak pernah APA.
--
-- device_id sendiri adalah UUID acak yang dibuat peramban pengunjung lewat
-- cookie httpOnly bertanda tangan. Ia tidak diturunkan dari apa pun: bukan
-- dari IP, bukan dari perangkat, bukan dari hasil hash informasi apa pun.
-- Menghapus cookie berarti menjadi perangkat baru — dan itu memang batasnya:
-- ini rem terhadap banjir kiriman tidak sengaja, bukan sistem identitas.
-- =====================================================================

begin;

create table if not exists kuota_kirim (
  device_id uuid  not null,
  tanggal   date  not null,
  jumlah    int   not null default 0 check (jumlah >= 0),
  primary key (device_id, tanggal)
);

comment on table kuota_kirim is
  'Hitungan kiriman per perangkat per hari (WIB). Tidak menyimpan IP, tidak menyimpan sidik jari, dan sengaja TIDAK punya relasi apa pun ke tabel laporan — barisnya tidak boleh bisa dihubungkan ke isi laporan mana pun.';
comment on column kuota_kirim.device_id is
  'UUID acak dari cookie httpOnly. Bukan turunan IP, user agent, atau sidik jari peramban.';
comment on column kuota_kirim.tanggal is
  'Tanggal WIB (Asia/Jakarta), ditetapkan server. Pengirim tidak pernah menentukan nilai ini.';


-- ---------------------------------------------------------------------
-- RLS: tabelnya tertutup rapat, tanpa satu pun policy.
--
-- Tidak ada policy sama sekali berarti anon dan authenticated tidak bisa
-- select, insert, update, maupun delete barisnya lewat API. Itu disengaja:
-- kalau pengirim bisa menulis tabel ini, ia bisa mengatur ulang hitungannya
-- sendiri dan batasnya jadi hiasan.
--
-- Satu-satunya jalan masuk adalah dua fungsi security definer di bawah.
-- ---------------------------------------------------------------------
alter table kuota_kirim enable row level security;

revoke all on kuota_kirim from anon, authenticated;


-- ---------------------------------------------------------------------
-- pakai_kuota — memeriksa DAN menaikkan hitungan dalam satu pernyataan.
--
-- Digabung jadi satu bukan demi ringkas, tapi karena memeriksa lalu menaikkan
-- sebagai dua langkah terpisah bisa dilewati dua kiriman yang tiba bersamaan:
-- keduanya membaca "sudah 2", keduanya menyimpulkan boleh, dan yang tersimpan
-- jadi empat. Dengan ON CONFLICT ... WHERE, Postgres yang menjamin hanya satu
-- yang menang.
--
-- WHERE pada DO UPDATE itu kuncinya: kalau jumlahnya sudah mencapai batas,
-- tidak ada baris yang diperbarui dan RETURNING tidak mengembalikan apa-apa —
-- jadi hitungannya TIDAK naik saat ditolak. Tanpa itu, satu perangkat yang
-- terus mencoba akan menumpuk angka yang tidak pernah dipakai.
--
-- Tanggalnya dihitung di sini dari zona Asia/Jakarta, bukan diterima sebagai
-- argumen. Pemanggil tidak boleh punya suara soal "hari ini tanggal berapa".
-- ---------------------------------------------------------------------
create or replace function pakai_kuota(perangkat uuid)
returns table (diizinkan boolean, terpakai int, sisa int, reset_pada timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batas  constant int := 3;
  hari   date := (now() at time zone 'Asia/Jakarta')::date;
  sesudah int;
begin
  insert into public.kuota_kirim as k (device_id, tanggal, jumlah)
  values (perangkat, hari, 1)
  on conflict (device_id, tanggal) do update
    set jumlah = k.jumlah + 1
    where k.jumlah < batas
  returning k.jumlah into sesudah;

  if sesudah is null then
    -- Tidak ada baris yang ditulis: kuotanya sudah habis hari ini.
    select k.jumlah into sesudah
      from public.kuota_kirim k
     where k.device_id = perangkat and k.tanggal = hari;

    return query select
      false,
      coalesce(sesudah, batas),
      0,
      ((hari + 1)::timestamp at time zone 'Asia/Jakarta');
    return;
  end if;

  return query select
    true,
    sesudah,
    greatest(batas - sesudah, 0),
    ((hari + 1)::timestamp at time zone 'Asia/Jakarta');
end;
$$;

comment on function pakai_kuota(uuid) is
  'Menaikkan hitungan kiriman perangkat untuk hari ini (WIB) bila masih di bawah batas. Mengembalikan diizinkan/terpakai/sisa/reset_pada. Tidak menaikkan apa pun saat menolak.';


-- ---------------------------------------------------------------------
-- batal_kuota — mengembalikan satu jatah yang terlanjur dipakai.
--
-- Dipanggil kalau kuota sudah diambil tapi penyimpanan laporannya gagal
-- (jaringan putus, constraint ditolak). Tanpa ini, kegagalan di pihak kita
-- memakan jatah warga — tiga percobaan yang semuanya gagal akan menghabiskan
-- kuota sehari tanpa satu pun laporan tersimpan.
--
-- greatest(...,0) menjaga hitungannya tidak pernah jadi negatif walau fungsi
-- ini terpanggil lebih sering daripada seharusnya.
-- ---------------------------------------------------------------------
create or replace function batal_kuota(perangkat uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.kuota_kirim
     set jumlah = greatest(jumlah - 1, 0)
   where device_id = perangkat
     and tanggal = (now() at time zone 'Asia/Jakarta')::date;
$$;


revoke all on function pakai_kuota(uuid) from public;
revoke all on function batal_kuota(uuid) from public;
grant execute on function pakai_kuota(uuid) to anon, authenticated;
grant execute on function batal_kuota(uuid) to anon, authenticated;

commit;
