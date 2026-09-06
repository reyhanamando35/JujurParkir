# Screenshot untuk README

Taruh sebelas berkas berikut di folder ini. **Nama berkasnya harus persis**
seperti di bawah, karena `README.md` di root sudah menautkannya dengan path
relatif — begitu berkasnya ada dan di-commit, gambarnya langsung muncul di
GitHub tanpa perlu URL apa pun.

## Tampilan desktop (lebar ±1280 px)

| Berkas | Isi yang harus difoto |
|---|---|
| `01-halaman-awal.png`   | Halaman `/` — dua kartu "Warga" dan "Petugas" beserta tautan cek status |
| `02-peta-warga.png`     | `/warga`, peta zoom kota penuh, gugus pin menyebar, kotak pencarian tampak di atas peta |
| `03-popup-titik.png`    | Popup satu titik terbuka — jam jaga, tarif motor & mobil, keterangan verifikasi, "Sumber: Perda 7/2023", jumlah laporan |
| `04-dasbor-petugas.png` | `/petugas/dasbor` sesudah login — grafik, penyaring, tabel laporan |
| `05-cek-status.png`     | `/warga/cek/[kode]` menampilkan status dan tindak lanjut petugas |

## Tampilan ponsel (lebar 375 px)

Buka DevTools → **Toggle device toolbar** → pilih **iPhone SE (375 × 667)**.
Itu ukuran tersempit yang diuji; yang rapi di sini akan rapi di ponsel lain.

| Berkas | Isi yang harus difoto | Yang ingin ditunjukkan |
|---|---|---|
| `06-hp-halaman-awal.png`  | Halaman `/` | Dua kartu tersusun menurun, tidak ada scroll horizontal |
| `07-hp-peta.png`          | `/warga` | Kotak pencarian selebar layar; **atribusi OpenStreetMap di kiri bawah terlihat utuh** |
| `08-hp-pencarian.png`     | `/warga`, ketik `baliwerti` di kotak pencarian | Daftar saran menutupi peta dan tidak terpotong di tepi layar |
| `09-hp-popup-titik.png`   | Popup satu titik terbuka | Isi popup dapat digulir; judul alamat dan tombol tutup **tidak** terpotong |
| `10-hp-form-laporan.png`  | Form laporan warga | Pilihan jenis keluhan dan kolom keterangan |
| `11-hp-dasbor.png`        | `/petugas/dasbor` sesudah login | Tabel laporan dapat digeser mendatar di dalam wadahnya sendiri |

## Catatan teknis

- PNG atau JPG sama-sama bisa. Kalau memakai `.jpg`, ubah juga ekstensinya di
  `README.md` root.
- Lebar tampil sudah diatur di `README.md` (800 px untuk desktop, 240 px untuk
  ponsel), jadi berkas aslinya boleh beresolusi penuh.
- Folder ini sengaja **bukan** `docs/` — `docs/` masuk `.gitignore`, sehingga
  gambarnya tidak akan pernah ter-commit ke sana. Juga bukan `public/`, supaya
  screenshot tidak ikut ter-deploy sebagai aset aplikasi.

## Peringatan

Jangan pernah menyertakan tangkapan layar dashboard Dishub yang memuat data
pribadi juru parkir (nama, NIK, alamat, nomor telepon).

Bila laporan uji yang terfoto memuat catatan atau foto yang bisa
mengidentifikasi seseorang, ganti dulu isinya sebelum difoto. Hal ini terutama
berlaku untuk `04-dasbor-petugas.png`, `05-cek-status.png`, dan
`11-hp-dasbor.png`, yang menampilkan isi laporan sungguhan.
