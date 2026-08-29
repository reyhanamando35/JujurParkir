import pandas as pd
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
import time
import re
import logging

# ============================================================
# KONFIGURASI LOGGING
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('geocoding_log.txt', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ============================================================
# BOUNDING BOX SURABAYA
# Membatasi pencarian Nominatim hanya di area Surabaya
# Format: (south_lat, north_lat, west_lon, east_lon)
# ============================================================
SURABAYA_VIEWBOX = (112.6, -7.4, 112.85, -7.15)  # (west, south, east, north)

# ============================================================
# MAPPING SINGKATAN → NAMA LENGKAP JALAN DI SURABAYA
# ============================================================
SINGKATAN_MAP = {
    "ACH JAIS": "Achmad Jais",
    "ACH ": "Achmad ",
    "HR MUHAMMAD": "Hayat Rahman Muhammad",
    "HR ": "Haji ",
    "DR SOETOMO": "Dokter Soetomo",
    "DR ": "Dokter ",
    "IR SUKARNO": "Ir Soekarno",
    "IR ANWARI": "Ir Anwari",
    "IR ": "Ir ",
    "KH MAS MANSUR": "KH Mas Mansyur",
    "KH MAS MANSYUR": "KH Mas Mansyur",
    "KH ": "Kyai Haji ",
    "WR SUPRATMAN": "WR Supratman",
    "MAYJEN SUNGKONO": "Mayjend Sungkono",
    "MAYJEN ": "Mayor Jenderal ",
    "KOMBES M DURYAT": "Kombes Pol M Duryat",
    "KOMBES POL M DURIYAT": "Kombes Pol M Duryat",
    "RESIDEN SUDIRMAN": "Jenderal Sudirman",
    "RAYA DARMO": "Raya Darmo",
    "PANDIGILING": "Pandegiling",
}

# ============================================================
# DAFTAR AWALAN YANG MENUNJUKKAN DATA BUKAN NAMA JALAN
# (kolom Alamat dan Lokasi mungkin tertukar)
# ============================================================
BUKAN_JALAN_PREFIX = [
    "DEPAN ", "SAMPING ", "BELAKANG ",
    "PKL", "RM ", "RM.", "TOKO ", "DEPOT ",
    "RESTO ", "CAFE ", "KAFE ",
    "BON AMI", "BFI FINA", "JNT", "HONDA",
    "HANS FUTSAL", "MEGA GROSIR", "PROFIRA",
    "PENYETAN ", "LUBERAN ", "ROTI JHON",
    "PERTOKOAN PROPERTI", "PRAKTEK DR",
    "TOKO ASPIRA", "TOKO BUKU", "TOKO HAPPY",
    "TOKO PUTRA", "TOMOROW", "RM JATINANGOR",
    "RM SEGO", "RM.", "RESTO COLOUR",
    "PKL BAKSO", "PKL RUNGKUT", "SEGOAKHIRAT",
    "SANGSEKERTA",
]


def bersihkan_alamat(alamat_raw):
    """
    Membersihkan dan menormalisasi string alamat agar lebih cocok
    untuk pencarian Nominatim.
    """
    alamat = str(alamat_raw).strip()

    # Terapkan mapping singkatan (urut dari yang paling panjang dulu)
    sorted_keys = sorted(SINGKATAN_MAP.keys(), key=len, reverse=True)
    for singkatan in sorted_keys:
        if singkatan in alamat.upper():
            # Case-insensitive replace
            pattern = re.compile(re.escape(singkatan), re.IGNORECASE)
            alamat = pattern.sub(SINGKATAN_MAP[singkatan], alamat)

    # Hapus suffix "SURABAYA" yang redundan (akan ditambahkan di query)
    alamat = re.sub(r'\s*SURABAYA\s*$', '', alamat, flags=re.IGNORECASE)
    # Hapus tanda " - " di akhir
    alamat = re.sub(r'\s*-\s*$', '', alamat)
    # Hapus karakter aneh
    alamat = re.sub(r'[_]', ' ', alamat)
    # Bersihkan spasi berlebihan
    alamat = re.sub(r'\s+', ' ', alamat).strip()

    return alamat


def ekstrak_nama_jalan(alamat):
    """
    Mengekstrak nama jalan saja (tanpa nomor) dari string alamat.
    Contoh: "BUBUTAN 105" -> "Bubutan"
            "BARATA JAYA 42 60" -> "Barata Jaya"
    """
    # Hapus angka dan karakter setelahnya (nomor rumah)
    # Pattern: ambil kata-kata huruf di awal, berhenti saat ketemu angka
    match = re.match(r'^([A-Za-z\s\-\.\']+)', alamat)
    if match:
        nama = match.group(1).strip()
        # Hapus trailing dash/space
        nama = re.sub(r'[\s\-]+$', '', nama)
        return nama
    return alamat


def apakah_alamat_tertukar(alamat):
    """
    Mendeteksi apakah kolom Alamat berisi data yang seharusnya
    ada di kolom Lokasi (bukan nama jalan).
    """
    alamat_upper = str(alamat).upper().strip()
    for prefix in BUKAN_JALAN_PREFIX:
        if alamat_upper.startswith(prefix):
            return True
    return False


def geocode_dengan_fallback(geocode_func, alamat_bersih, lokasi, row_num):
    """
    Melakukan geocoding dengan beberapa level fallback:
    1. Alamat lengkap + Surabaya (structured query)
    2. Nama jalan saja + Surabaya (structured query)
    3. Kolom Lokasi + Surabaya (jika alamat gagal)
    4. Free-text search dengan viewbox
    """

    hasil = None

    # --- Level 1: Structured query dengan alamat lengkap ---
    try:
        hasil = geocode_func(
            query={'street': alamat_bersih, 'city': 'Surabaya', 'state': 'Jawa Timur', 'country': 'Indonesia'},
            viewbox=[(SURABAYA_VIEWBOX[3], SURABAYA_VIEWBOX[0]),  # (north, west)
                     (SURABAYA_VIEWBOX[1], SURABAYA_VIEWBOX[2])],  # (south, east)
            bounded=True
        )
        if hasil:
            logger.info(f"  [OK L1-structured] Row {row_num}: '{alamat_bersih}' -> ({hasil.latitude}, {hasil.longitude})")
            return hasil
    except Exception as e:
        logger.debug(f"  [SKIP L1] Row {row_num}: structured query error: {e}")

    # --- Level 2: Free-text query dengan alamat lengkap ---
    try:
        query_text = f"Jalan {alamat_bersih}, Surabaya, Jawa Timur"
        hasil = geocode_func(
            query=query_text,
            viewbox=[(SURABAYA_VIEWBOX[3], SURABAYA_VIEWBOX[0]),
                     (SURABAYA_VIEWBOX[1], SURABAYA_VIEWBOX[2])],
            bounded=True
        )
        if hasil:
            logger.info(f"  [OK L2-freetext] Row {row_num}: '{query_text}' -> ({hasil.latitude}, {hasil.longitude})")
            return hasil
    except Exception as e:
        logger.debug(f"  [SKIP L2] Row {row_num}: free-text error: {e}")

    # --- Level 3: Hanya nama jalan (tanpa nomor) ---
    nama_jalan = ekstrak_nama_jalan(alamat_bersih)
    if nama_jalan and nama_jalan != alamat_bersih:
        try:
            query_text = f"Jalan {nama_jalan}, Surabaya, Jawa Timur"
            hasil = geocode_func(
                query=query_text,
                viewbox=[(SURABAYA_VIEWBOX[3], SURABAYA_VIEWBOX[0]),
                         (SURABAYA_VIEWBOX[1], SURABAYA_VIEWBOX[2])],
                bounded=True
            )
            if hasil:
                logger.info(f"  [OK L3-jalan] Row {row_num}: '{query_text}' -> ({hasil.latitude}, {hasil.longitude})")
                return hasil
        except Exception as e:
            logger.debug(f"  [SKIP L3] Row {row_num}: nama jalan error: {e}")

    # --- Level 4: Coba gunakan kolom Lokasi sebagai pencarian ---
    if pd.notna(lokasi) and str(lokasi).strip():
        lokasi_str = str(lokasi).strip()
        try:
            query_text = f"{lokasi_str}, Surabaya"
            hasil = geocode_func(
                query=query_text,
                viewbox=[(SURABAYA_VIEWBOX[3], SURABAYA_VIEWBOX[0]),
                         (SURABAYA_VIEWBOX[1], SURABAYA_VIEWBOX[2])],
                bounded=True
            )
            if hasil:
                logger.info(f"  [OK L4-lokasi] Row {row_num}: '{query_text}' -> ({hasil.latitude}, {hasil.longitude})")
                return hasil
        except Exception as e:
            logger.debug(f"  [SKIP L4] Row {row_num}: lokasi error: {e}")

    logger.warning(f"  [GAGAL] Row {row_num}: Semua level gagal untuk '{alamat_bersih}'")
    return None


def main():
    df = pd.read_csv("data_parkir_surabaya.csv")
    logger.info(f"Total data: {len(df)} baris")

    geolocator = Nominatim(
        user_agent="peta_parkir_surabaya_tugas_marcel_v2",
        timeout=10
    )
    geocode = RateLimiter(
        geolocator.geocode,
        min_delay_seconds=1.5,  # Lebih aman dari batas 1 req/s
        max_retries=3,
        error_wait_seconds=10
    )

    # ============================================================
    # PROSES GEOCODING
    # ============================================================
    latitudes = []
    longitudes = []
    status_list = []
    level_list = []

    total = len(df)
    sukses = 0
    gagal = 0

    for idx, row in df.iterrows():
        row_num = idx + 1
        alamat_raw = str(row.get('Alamat', ''))
        lokasi_raw = str(row.get('Lokasi', ''))

        # Deteksi apakah kolom Alamat dan Lokasi tertukar
        if apakah_alamat_tertukar(alamat_raw) and not apakah_alamat_tertukar(lokasi_raw):
            logger.info(f"Row {row_num}: Kolom tertukar, gunakan Lokasi '{lokasi_raw}' sebagai alamat")
            alamat_untuk_geocode = lokasi_raw
            lokasi_untuk_fallback = alamat_raw
        else:
            alamat_untuk_geocode = alamat_raw
            lokasi_untuk_fallback = lokasi_raw

        # Bersihkan alamat
        alamat_bersih = bersihkan_alamat(alamat_untuk_geocode)

        logger.info(f"[{row_num}/{total}] Proses: '{alamat_raw}' -> '{alamat_bersih}'")

        # Geocoding dengan fallback
        hasil = geocode_dengan_fallback(geocode, alamat_bersih, lokasi_untuk_fallback, row_num)

        if hasil:
            lat = hasil.latitude
            lng = hasil.longitude

            # Validasi: pastikan koordinat masih di area Surabaya
            if -7.5 <= lat <= -7.1 and 112.5 <= lng <= 112.9:
                latitudes.append(lat)
                longitudes.append(lng)
                status_list.append("OK")
                sukses += 1
            else:
                logger.warning(f"  [DILUAR AREA] Row {row_num}: ({lat}, {lng}) bukan area Surabaya!")
                latitudes.append(None)
                longitudes.append(None)
                status_list.append("DILUAR_AREA")
                gagal += 1
        else:
            latitudes.append(None)
            longitudes.append(None)
            status_list.append("GAGAL")
            gagal += 1

        # Progress update setiap 50 baris
        if row_num % 50 == 0:
            logger.info(f"=== PROGRESS: {row_num}/{total} | Sukses: {sukses} | Gagal: {gagal} ===")

    # ============================================================
    # SIMPAN HASIL
    # ============================================================
    df['lat'] = latitudes
    df['lng'] = longitudes
    df['geocode_status'] = status_list

    # Simpan SEMUA data (termasuk yang gagal, agar bisa di-review)
    df.to_csv("titik_parkir_geocoded_full.csv", index=False, encoding='utf-8-sig')
    logger.info(f"Semua data disimpan ke titik_parkir_geocoded_full.csv")

    # Simpan hanya yang berhasil
    df_clean = df.dropna(subset=['lat', 'lng'])
    df_clean.to_csv("titik_parkir_geocoded.csv", index=False, encoding='utf-8-sig')
    logger.info(f"Data bersih disimpan ke titik_parkir_geocoded.csv")

    # ============================================================
    # RINGKASAN
    # ============================================================
    logger.info("=" * 60)
    logger.info(f"SELESAI!")
    logger.info(f"  Total data    : {total}")
    logger.info(f"  Berhasil      : {sukses} ({sukses/total*100:.1f}%)")
    logger.info(f"  Gagal         : {gagal} ({gagal/total*100:.1f}%)")
    logger.info(f"  Diluar area   : {status_list.count('DILUAR_AREA')}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()