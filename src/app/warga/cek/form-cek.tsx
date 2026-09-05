"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import {
  langganRiwayat,
  rapikanKode,
  snapshotRiwayat,
  snapshotRiwayatServer,
} from "@/lib/riwayat-kode";

export function FormCek() {
  const router = useRouter();
  const [kode, setKode] = useState("");

  // localStorage adalah penyimpanan di luar React. useSyncExternalStore
  // menanganinya tanpa membuat HTML server berbeda dari klien: di server
  // snapshotnya daftar kosong, di peramban isinya yang sebenarnya.
  const riwayat = useSyncExternalStore(
    langganRiwayat,
    snapshotRiwayat,
    snapshotRiwayatServer,
  );

  const kirim = (peristiwa: React.FormEvent) => {
    peristiwa.preventDefault();
    const bersih = rapikanKode(kode);
    if (bersih.length === 0) return;
    router.push(`/warga/cek/${encodeURIComponent(bersih)}`);
  };

  return (
    <>
      <form onSubmit={kirim} className="mt-5 flex flex-col gap-3">
        <div>
          <label
            htmlFor="kode"
            className="text-sm font-medium leading-normal text-ink"
          >
            Kode laporan
          </label>
          <input
            id="kode"
            name="kode"
            value={kode}
            onChange={(e) => setKode(rapikanKode(e.target.value))}
            required
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Contoh: JSV8J2"
            className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-lg font-semibold tracking-widest text-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        </div>

        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] motion-reduce:transition-none"
        >
          Cek status
        </button>
      </form>

      {riwayat.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold leading-tight text-ink">
            Laporan dari perangkat ini
          </h2>
          <p className="mt-1 text-pretty text-sm leading-normal text-ink-muted">
            Disimpan di peramban ini saja — tidak dikirim ke mana pun dan tidak
            terhubung ke identitas siapa pun.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {riwayat.map((e) => (
              <li key={e.kode}>
                <Link
                  href={`/warga/cek/${e.kode}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors duration-150 ease-out hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
                >
                  <span className="font-semibold tracking-widest text-ink">
                    {e.kode}
                  </span>
                  <span className="text-sm leading-normal text-ink-muted">
                    {e.pada > 0
                      ? new Date(e.pada).toLocaleDateString("id-ID", {
                          dateStyle: "medium",
                        })
                      : "tanggal tidak tercatat"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
