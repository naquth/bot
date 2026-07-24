"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function MasukPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"masuk" | "daftar">("masuk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "masuk") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Email atau kata sandi salah.");
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, display_name: displayName || username },
        },
      });
      if (error) {
        setError(
          error.message === "User already registered"
            ? "Email ini sudah terdaftar."
            : "Gagal mendaftar. Coba lagi."
        );
        setLoading(false);
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  const inputClass =
    "rounded-2xl border border-white/[0.1] bg-[#0F0F10] px-4 py-3.5 text-[15px] text-white placeholder:text-[var(--color-text-faint)] transition-colors focus:border-white/40 focus:outline-none";

  return (
    <div className="mx-auto flex min-h-screen max-w-[400px] flex-col justify-center px-6 py-10">
      <h1 className="font-display text-[32px] font-extrabold tracking-[-0.02em] text-white">Utas</h1>
      <p className="mt-1.5 text-[15px] text-[var(--color-text-dim)]">
        {mode === "masuk" ? "Masuk ke akunmu." : "Buat akun baru."}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        {mode === "daftar" && (
          <>
            <input
              type="text"
              placeholder="Nama tampilan"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Nama pengguna"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              required
              minLength={3}
              className={inputClass}
            />
          </>
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Kata sandi"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className={inputClass}
        />

        {error && <p className="text-[13.5px] font-medium text-[var(--color-like)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-white py-3.5 text-[15px] font-bold text-black transition-all active:scale-[0.98] active:opacity-85 disabled:opacity-40"
        >
          {loading ? "Memproses…" : mode === "masuk" ? "Masuk" : "Daftar"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[12px] font-medium text-[var(--color-text-faint)]">atau</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        onClick={handleGoogle}
        className="flex items-center justify-center gap-2.5 rounded-full border border-white/[0.1] bg-[#0F0F10] py-3.5 text-[14.5px] font-semibold text-white transition-colors active:bg-white/[0.06]"
      >
        <GoogleIcon />
        Lanjutkan dengan Google
      </button>

      <button
        onClick={() => {
          setMode(mode === "masuk" ? "daftar" : "masuk");
          setError(null);
        }}
        className="mt-7 text-center text-[14px] font-medium text-[var(--color-text-dim)] transition-colors active:text-white"
      >
        {mode === "masuk" ? "Belum punya akun? " : "Sudah punya akun? "}
        <span className="font-bold text-white">{mode === "masuk" ? "Daftar" : "Masuk"}</span>
      </button>

      <Link
        href="/"
        className="mt-4 text-center text-[13.5px] text-[var(--color-text-faint)] hover:underline"
      >
        Kembali ke beranda
      </Link>
    </div>
  );
}
