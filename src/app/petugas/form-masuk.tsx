"use client";

import { useActionState, useState } from "react";

import { masuk, type StatusMasuk } from "./actions";

const statusAwal: StatusMasuk = { pesan: null };

const fieldClassName = [
  "mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5",
  "text-base leading-normal text-ink placeholder:text-ink-muted",
  "transition-colors duration-150 ease-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  "motion-reduce:transition-none",
].join(" ");

export function FormMasuk() {
  const [status, formAction, menunggu] = useActionState(masuk, statusAwal);

  // React mengosongkan form setelah submit. Emailnya dikendalikan sendiri
  // supaya tidak perlu diketik ulang tiap kali kata sandinya salah —
  // mengetik ulang email di pinggir jalan dengan satu ibu jari itu mahal.
  // Kata sandi sengaja TIDAK diisi ulang.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      <div>
        <label
          htmlFor="email"
          className="text-sm font-medium leading-normal text-ink"
        >
          Email dinas
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nama@dishub.com"
          aria-describedby={status.pesan ? "galat-masuk" : undefined}
          className={fieldClassName}
        />
      </div>

      <div>
        <label
          htmlFor="kata_sandi"
          className="text-sm font-medium leading-normal text-ink"
        >
          Kata sandi
        </label>
        <input
          id="kata_sandi"
          name="kata_sandi"
          type="password"
          required
          autoComplete="current-password"
          aria-describedby={status.pesan ? "galat-masuk" : undefined}
          className={fieldClassName}
        />
      </div>

      {/*
        Wadahnya selalu ada di DOM supaya pembaca layar mengumumkan
        pesan yang muncul belakangan, dan supaya tata letak tidak
        bergeser saat galat tampil (CLS tetap 0).
      */}
      <p
        id="galat-masuk"
        role="alert"
        aria-live="polite"
        className="min-h-5 text-sm leading-normal text-ink"
      >
        {status.pesan ? (
          <span className="flex items-start gap-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="mt-0.5 size-4 shrink-0 text-accent"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5" />
              <path d="M12 16h.01" />
            </svg>
            {status.pesan}
          </span>
        ) : null}
      </p>

      <button
        type="submit"
        disabled={menunggu}
        className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
      >
        {menunggu ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}
