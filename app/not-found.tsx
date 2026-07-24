import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col items-center justify-center border-x border-[var(--color-border)] px-6 text-center">
      <h1 className="font-display text-[23px] font-extrabold tracking-[-0.015em] text-white">
        Halaman tidak ditemukan
      </h1>
      <p className="mt-2.5 text-[15px] text-[var(--color-text-dim)]">
        Utas yang kamu cari mungkin sudah dihapus atau tidak pernah ada.
      </p>
      <Link
        href="/"
        className="mt-7 rounded-full bg-white px-6 py-3 text-[14.5px] font-bold text-black transition-opacity active:opacity-80"
      >
        Kembali ke beranda
      </Link>
    </div>
  );
}
