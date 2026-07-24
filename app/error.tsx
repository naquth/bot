"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col items-center justify-center border-x border-[var(--color-border)] px-6 text-center">
      <h1 className="font-display text-[23px] font-extrabold tracking-[-0.015em] text-white">
        Ada yang salah
      </h1>
      <p className="mt-2.5 text-[15px] text-[var(--color-text-dim)]">
        Terjadi kesalahan saat memuat halaman ini. Coba lagi sebentar.
      </p>
      <button
        onClick={reset}
        className="mt-7 rounded-full bg-white px-6 py-3 text-[14.5px] font-bold text-black transition-opacity active:opacity-80"
      >
        Coba lagi
      </button>
    </div>
  );
}
