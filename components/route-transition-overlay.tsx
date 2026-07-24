"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { skeletonForPath } from "@/components/route-skeletons";

const MIN_VISIBLE_MS = 220;
const NAVIGATE_EVENT = "utas:route-transition-start";

/**
 * Dipakai oleh komponen yang bernavigasi lewat router.push() /
 * router.replace() (bukan lewat <a href> biasa), supaya overlay skeleton
 * tetap muncul untuk navigasi programatik tersebut juga. Contoh pemakaian:
 *
 *   import { useRouter } from "next/navigation";
 *   import { announceRouteTransition } from "@/components/route-transition-overlay";
 *
 *   const router = useRouter();
 *   announceRouteTransition("/tulis/draft");
 *   router.push("/tulis/draft");
 */
export function announceRouteTransition(targetPath: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { targetPath } }));
}

/**
 * Kenapa komponen ini ada:
 *
 * 1) "Animasi beranda dulu baru animasi profil" — ini terjadi karena
 *    <Link> milik Next.js melakukan prefetch di background dan menyimpan
 *    hasilnya ke Router Cache (~30 detik). Saat pindah ke /profil/[username],
 *    Next kadang menampilkan apa pun yang masih ter-resolve dari cache
 *    (termasuk state beranda) sebelum akhirnya swap ke skeleton
 *    /profil/[username]/loading.tsx yang benar. Ini perilaku default
 *    Next.js seputar prefetch, bukan sesuatu yang bisa "dimatikan" murni
 *    lewat pengaturan file loading.tsx.
 *
 * 2) "Tidak ada animasi saat refresh" — loading.tsx HANYA berlaku untuk
 *    transisi client-side (didokumentasikan resmi oleh Next.js). Saat hard
 *    refresh / kunjungan pertama, seluruh halaman datang sebagai satu
 *    response HTML; tidak ada fase "fallback" yang terlihat kalau server
 *    cukup cepat menjawab.
 *
 * Solusinya di sini: hentikan ketergantungan pada perilaku otomatis
 * loading.tsx untuk dua kasus itu, dan gambar skeleton yang BENAR secara
 * eksplisit dari client:
 *   - Tangkap klik ke <a href> secara global (capture phase, sebelum router
 *     Next sempat bereaksi), tentukan skeleton tujuan dari skeletonForPath,
 *     dan tampilkan overlay itu SEKARANG JUGA — tidak menunggu apa pun.
 *   - Overlay hilang begitu usePathname() benar-benar berubah ke path
 *     tujuan (menandakan konten baru sudah terpasang), dengan durasi
 *     tampil minimum supaya tidak terasa seperti "kedip".
 *   - Saat mount pertama kali (refresh / kunjungan awal), overlay untuk
 *     path SAAT INI otomatis ditampilkan sebentar sebelum menampilkan
 *     konten asli yang sudah ter-render duluan di baliknya.
 */
export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const [overlay, setOverlay] = useState<{ path: string; node: React.ReactNode } | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const shownAtRef = useRef<number>(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMountRef = useRef(true);

  // Kasus 2: kunjungan pertama / refresh. Tampilkan skeleton untuk rute
  // yang sedang aktif sebentar, walau konten sebenarnya sudah selesai
  // di-render server — supaya transisi awal selalu terasa ada animasinya
  // dan tidak "meloncat" tiba-tiba.
  useEffect(() => {
    if (!isFirstMountRef.current) return;
    isFirstMountRef.current = false;

    setOverlay({ path: pathname, node: skeletonForPath(pathname) });
    shownAtRef.current = Date.now();
    hideTimeoutRef.current = setTimeout(() => {
      setOverlay(null);
    }, MIN_VISIBLE_MS);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kasus 1: klik navigasi. Tangkap di capture phase supaya lebih cepat
  // dari handler <Link> milik Next sendiri.
  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.target === "_blank") return;

      const targetPath = href.split("?")[0].split("#")[0];
      if (targetPath === pathname) return;

      pendingPathRef.current = targetPath;
      setOverlay({ path: targetPath, node: skeletonForPath(targetPath) });
      shownAtRef.current = Date.now();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }

    document.addEventListener("click", onClickCapture, { capture: true });

    function onAnnounced(e: Event) {
      const targetPath = (e as CustomEvent<{ targetPath: string }>).detail?.targetPath;
      if (!targetPath || targetPath === pathname) return;
      pendingPathRef.current = targetPath;
      setOverlay({ path: targetPath, node: skeletonForPath(targetPath) });
      shownAtRef.current = Date.now();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }
    window.addEventListener(NAVIGATE_EVENT, onAnnounced);

    return () => {
      document.removeEventListener("click", onClickCapture, { capture: true });
      window.removeEventListener(NAVIGATE_EVENT, onAnnounced);
    };
  }, [pathname]);

  // Begitu pathname benar-benar berpindah ke tujuan yang kita tunggu,
  // sembunyikan overlay (dengan durasi tampil minimum).
  useEffect(() => {
    if (!pendingPathRef.current) return;
    if (pathname !== pendingPathRef.current) return;

    pendingPathRef.current = null;
    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    hideTimeoutRef.current = setTimeout(() => setOverlay(null), remaining);
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [pathname]);

  // Jaring pengaman: jangan biarkan overlay macet kalau navigasi dibatalkan
  // (mis. pengguna menekan tombol back di tengah jalan) atau gagal.
  useEffect(() => {
    if (!overlay) return;
    const safety = setTimeout(() => setOverlay(null), 4000);
    return () => clearTimeout(safety);
  }, [overlay]);

  if (!overlay) return null;

  return (
    <div className="fixed inset-0 z-[200] animate-fade-in bg-black" aria-hidden="true">
      {overlay.node}
    </div>
  );
}
