"use client";

import { useState, useSyncExternalStore } from "react";

const KUNCI = "jujurparkir:catatan-peta-dibaca";

/**
 * localStorage dibaca lewat useSyncExternalStore, bukan useEffect + setState.
 *
 * Ia memang penyimpanan di luar React, dan inilah cara yang disediakan untuk
 * membacanya tanpa memicu render berantai — sekaligus menjawab aturan lint
 * react-hooks/set-state-in-effect.
 */
let pendengar: Array<() => void> = [];

function langgan(ubah: () => void) {
  pendengar = [...pendengar, ubah];
  return () => {
    pendengar = pendengar.filter((f) => f !== ubah);
  };
}

function sudahDibacaKlien(): boolean {
  try {
    return localStorage.getItem(KUNCI) === "1";
  } catch {
    // Mode penyamaran memblokir localStorage; anggap belum dibaca.
    return false;
  }
}

/** Di server tidak ada localStorage, jadi catatannya dianggap belum dibaca. */
function sudahDibacaServer(): boolean {
  return false;
}

function tandaiDibaca() {
  try {
    localStorage.setItem(KUNCI, "1");
  } catch {
    // Tidak bisa diingat antar kunjungan, tapi tetap tertutup untuk sesi ini.
  }
  for (const ubah of pendengar) ubah();
}

/**
 * Catatan pengantar peta yang bisa ditutup.
 *
 * Isinya penting dibaca sekali — terutama bahwa tarifnya belum diverifikasi dan
 * posisi pin sebagian masih perkiraan — tapi setelah dibaca ia hanya memakan
 * ruang layar yang seharusnya jadi peta.
 */
export function CatatanPeta() {
  const sudahDibaca = useSyncExternalStore(
    langgan,
    sudahDibacaKlien,
    sudahDibacaServer,
  );
  // Dibuka lagi hanya untuk sesi ini; tidak menghapus penanda "sudah dibaca".
  const [dibukaLagi, setDibukaLagi] = useState(false);

  if (sudahDibaca && !dibukaLagi) {
    return (
      <button
        type="button"
        onClick={() => setDibukaLagi(true)}
        className="mx-auto block rounded-lg text-sm leading-normal text-ink-muted underline underline-offset-4 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Tentang data di peta ini
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-pretty text-sm leading-relaxed text-ink-muted">
        <span className="text-ink">1.235 titik parkir resmi</span> tepi jalan
        umum, dari data Dishub Kota Surabaya. Ketuk pin untuk melihat alamat dan
        jam jaganya.{" "}
        <span className="text-ink">Tarifnya belum diverifikasi</span> dan
        sengaja tidak ditampilkan — posisi pin pun sebagian masih perkiraan
        tengah ruas jalan.
      </p>

      {/*
        Dua angka yang berbeda arti tampil bersamaan di peta, dan tanpa
        penjelasan ini keduanya gampang tertukar.
      */}
      <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted">
        Angka pada <span className="text-ink">lingkaran di peta</span> adalah
        jumlah <span className="text-ink">laporan warga</span> di titik parkir
        area itu, 30 hari terakhir — lingkaran abu tanpa angka berarti belum ada
        laporan. Sorot lingkarannya untuk melihat berapa titik parkir yang
        dirangkumnya.{" "}
        <span className="text-ink">Pil bertuliskan &ldquo;laporan&rdquo;</span>{" "}
        menghitung laporan di lokasi yang tidak terdaftar, dengan pengelompokan
        wilayah yang masih perkiraan dari koordinat, dan hanya muncul untuk
        wilayah yang sudah ada laporannya.
      </p>

      <button
        type="button"
        onClick={() => {
          setDibukaLagi(false);
          tandaiDibaca();
        }}
        className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold leading-normal text-accent-ink hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        Saya paham
      </button>
    </div>
  );
}
