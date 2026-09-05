"use client";

import { useActionState } from "react";

import { simpanKataSandiBaru } from "../actions";

const statusAwal = { pesan: null as string | null };

const fieldClassName = [
  "mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5",
  "text-base leading-normal text-ink placeholder:text-ink-muted",
  "transition-colors duration-150 ease-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  "motion-reduce:transition-none",
].join(" ");

export function FormSandiBaru() {
  const [status, formAction, menunggu] = useActionState(
    simpanKataSandiBaru,
    statusAwal,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="kata_sandi"
          className="text-sm font-medium leading-normal text-ink"
        >
          Kata sandi baru
        </label>
        <input
          id="kata_sandi"
          name="kata_sandi"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby="bantuan-sandi"
          className={fieldClassName}
        />
        <p
          id="bantuan-sandi"
          className="mt-1 text-sm leading-normal text-ink-muted"
        >
          Minimal 8 karakter.
        </p>
      </div>

      <div>
        <label
          htmlFor="ulangi"
          className="text-sm font-medium leading-normal text-ink"
        >
          Ulangi kata sandi baru
        </label>
        <input
          id="ulangi"
          name="ulangi"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldClassName}
        />
      </div>

      <p
        role="alert"
        aria-live="polite"
        className="min-h-5 text-sm leading-normal text-ink"
      >
        {status.pesan}
      </p>

      <button
        type="submit"
        disabled={menunggu}
        className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-base font-semibold leading-normal text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
      >
        {menunggu ? "Menyimpan…" : "Simpan kata sandi"}
      </button>
    </form>
  );
}
