"use client";

import { useEffect, useState } from "react";
import { shortTime } from "@/lib/format-time";

/**
 * Membungkus shortTime() supaya aman dari hydration mismatch. shortTime()
 * menghitung selisih waktu dari `Date.now()` — nilai ini SELALU berbeda
 * antara render pertama di server dan saat client hydrate beberapa saat
 * kemudian. Kalau selisihnya kebetulan melewati ambang batas (mis. dari
 * 59 detik ke 60 detik, teksnya berubah dari "baru saja" ke "1m"), teks
 * yang di-render server tidak akan cocok dengan hasil hydrate client,
 * memicu React error #418 (hydration failed) — React lalu membongkar dan
 * me-render ulang subtree itu di client, yang bisa terasa seperti
 * "flicker" atau bahkan mengganggu state komponen di sekitarnya.
 *
 * Solusinya: render string co yang SAMA persis di server maupun saat
 * client pertama kali hydrate (dengan suppressHydrationWarning sebagai
 * jaring pengaman tambahan), lalu hitung nilai asli setelah mount lewat
 * useEffect — di titik itu React sudah tidak lagi membandingkan dengan
 * HTML dari server, jadi aman berubah sesukanya.
 */
export function RelativeTime({ dateStr, className }: { dateStr: string; className?: string }) {
  // `text` sengaja diinisialisasi `null` (bukan langsung shortTime(dateStr))
  // supaya render pertama di client SELALU cocok dengan render server
  // (keduanya menampilkan string kosong). Nilai asli baru dihitung lewat
  // useEffect di bawah — jalan setelah mount, di luar proses hydration
  // sama sekali, jadi tidak pernah dibandingkan React dengan HTML dari
  // server.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    // Effect ini berperan sebagai "subscription" ke waktu berjalan
    // (external system), bukan sekadar derive state dari props — pola ini
    // memang textbook use-case useEffect (lihat react.dev), beda dari
    // "menghitung nilai turunan dari props/state yang sudah ada" yang
    // biasanya lebih baik dihitung langsung di render body.
    const update = () => setText(shortTime(dateStr));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [dateStr]);

  return (
    <span className={className} suppressHydrationWarning>
      {text ?? ""}
    </span>
  );
}
