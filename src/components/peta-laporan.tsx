"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

import { pasangPetaDasar } from "@/lib/peta-dasar";

/**
 * Peta verifikasi untuk petugas.
 *
 * Berbeda tujuan dari peta warga: yang digambar di sini adalah LAPORAN, bukan
 * titik parkir. Karena itu tidak ada gugus, tidak ada popup tarif, dan tidak
 * ada alur pelaporan — mengetuk penanda hanya memilih laporannya.
 *
 * Peta dasarnya sengaja dipasang lewat helper yang sama dengan peta warga,
 * supaya batas zoom, lapisan tile, dan penjaga tepi kosongnya tidak pernah
 * menyimpang di antara keduanya.
 */

export type PenandaLaporan = {
  id: number;
  lat: number;
  lng: number;
  status: string;
  /** Dibacakan pembaca layar dan muncul saat penanda disorot. */
  ringkas: string;
};

type Status = "memuat" | "siap" | "gagal";

/**
 * Kelas penanda per status.
 *
 * Statusnya juga selalu tertulis sebagai teks di daftar dan di panel, jadi
 * warna di sini bukan satu-satunya pembawa makna — bentuknya pun dibedakan
 * (isi penuh / bergaris / putus-putus), supaya tetap terbaca oleh orang yang
 * tidak membedakan warna.
 */
const KELAS_STATUS: Record<string, string> = {
  baru: "pin-laporan pin-laporan--baru",
  proses: "pin-laporan pin-laporan--proses",
  selesai: "pin-laporan pin-laporan--selesai",
  ditolak: "pin-laporan pin-laporan--ditolak",
};

function lolos(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PetaLaporan({
  penanda,
  terpilih,
  onPilih,
}: {
  penanda: PenandaLaporan[];
  terpilih: number | null;
  onPilih: (id: number) => void;
}) {
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const petaRef = useRef<LeafletMap | null>(null);
  const penandaRef = useRef<Map<number, Marker>>(new Map());
  const [status, setStatus] = useState<Status>("memuat");
  const [siap, setSiap] = useState(0);

  /**
   * Penangan pilih disimpan di ref, bukan ditangkap langsung oleh closure
   * penanda. Kalau ditangkap, efek pemasangan penanda harus ikut bergantung
   * pada onPilih — dan setiap render induk akan membangun ulang seluruh
   * penanda, membuat peta berkedip tiap kali kolom pencarian diketik.
   */
  const onPilihRef = useRef(onPilih);
  useEffect(() => {
    onPilihRef.current = onPilih;
  }, [onPilih]);

  useEffect(() => {
    const wadah = wadahRef.current;
    if (!wadah) return;

    let peta: LeafletMap | null = null;
    let lepasPengamat: (() => void) | null = null;
    let dibatalkan = false;
    // Disalin ke variabel lokal supaya cleanup membereskan Map yang SAMA dengan
    // yang dipakai efek ini, bukan apa pun yang kebetulan ada di ref nanti.
    const daftarPenanda = penandaRef.current;

    void (async () => {
      try {
        const dasar = await pasangPetaDasar(wadah, {
          onTileError: () => {
            if (!dibatalkan) setStatus("gagal");
          },
          batal: () => dibatalkan || !wadahRef.current,
        });
        if (!dasar) return;

        peta = dasar.peta;
        lepasPengamat = dasar.bersihkan;
        petaRef.current = peta;
        setStatus("siap");
        setSiap((n) => n + 1);
      } catch (galat) {
        console.error("[peta-laporan] gagal menyiapkan peta:", galat);
        if (!dibatalkan) setStatus("gagal");
      }
    })();

    return () => {
      dibatalkan = true;
      lepasPengamat?.();
      lepasPengamat = null;
      petaRef.current = null;
      daftarPenanda.clear();
      peta?.remove();
      peta = null;
    };
  }, []);

  // Penanda dibangun ulang saat daftarnya berubah. Jumlahnya puluhan, bukan
  // ribuan, jadi tidak perlu pembanding per penanda seperti di peta warga.
  useEffect(() => {
    const peta = petaRef.current;
    if (!peta || status !== "siap") return;

    const L = (window as unknown as { L?: typeof import("leaflet") }).L;
    if (!L) return;

    const dipasang: Marker[] = [];
    const daftarPenanda = penandaRef.current;
    daftarPenanda.clear();

    for (const p of penanda) {
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<span class="${KELAS_STATUS[p.status] ?? KELAS_STATUS.baru}" title="${lolos(p.ringkas)}"></span>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        alt: p.ringkas,
        keyboard: false,
      });
      m.on("click", () => onPilihRef.current(p.id));
      m.addTo(peta);
      dipasang.push(m);
      daftarPenanda.set(p.id, m);
    }

    return () => {
      for (const m of dipasang) m.remove();
      daftarPenanda.clear();
    };
  }, [penanda, status, siap]);

  // Memilih dari daftar menggeser peta ke penandanya. Tanpa ini, dua cara
  // menemukan laporan terasa seperti dua halaman yang tidak saling bicara.
  useEffect(() => {
    const peta = petaRef.current;
    if (!peta || terpilih === null) return;
    const m = penandaRef.current.get(terpilih);
    if (!m) return;

    const el = m.getElement();
    if (el) el.classList.add("pin-laporan--terpilih");
    peta.panTo(m.getLatLng(), { animate: true });

    return () => {
      el?.classList.remove("pin-laporan--terpilih");
    };
  }, [terpilih, penanda]);

  return (
    <div className="relative h-[380px] overflow-hidden rounded-2xl border border-line sm:h-[460px]">
      <div ref={wadahRef} className="h-full w-full" />

      {status !== "siap" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2">
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-normal text-ink">
            {status === "gagal"
              ? "Peta gagal dimuat. Daftar di bawah tetap bisa dipakai."
              : "Memuat peta…"}
          </p>
        </div>
      )}
    </div>
  );
}
