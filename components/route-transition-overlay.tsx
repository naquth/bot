"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { skeletonForPath } from "@/components/route-skeletons";

const MIN_VISIBLE_MS = 220;
const NAVIGATE_EVENT = "utas:route-transition-start";
const SYNC_OVERLAY_ID = "utas-sync-route-overlay";

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

// Render skeleton ke string HTML statis untuk dipasang langsung lewat DOM
// API (bukan lewat React state) pada saat klik terjadi. Ini penting: kalau
// kita hanya memanggil setState di dalam click handler, overlay baru benar-
// benar tercat ke layar setelah React menjadwalkan ulang render — dan pada
// celah waktu itu, transisi rute bawaan Next.js (yang juga sempat memasang
// app/loading.tsx miliknya sendiri sebelum konten baru siap) bisa sempat
// ter-paint duluan, menyebabkan kedipan skeleton yang salah. Dengan
// memasang elemen overlay langsung ke DOM secara síncron di dalam event
// handler yang sama, overlay pasti tercat di frame yang SAMA dengan klik,
// sebelum apa pun di baliknya sempat berubah.
import { renderToStaticMarkup } from "react-dom/server";

function paintSyncOverlay(node: React.ReactNode) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(SYNC_OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = SYNC_OVERLAY_ID;
    el.setAttribute("aria-hidden", "true");
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "200";
    el.style.background = "black";
    document.body.appendChild(el);
  }
  el.innerHTML = renderToStaticMarkup(node);
  el.style.display = "block";
}

function clearSyncOverlay() {
  const el = document.getElementById(SYNC_OVERLAY_ID);
  if (el) el.style.display = "none";
}

/**
 * Kenapa komponen ini ada:
 *
 * "Animasi beranda dulu baru animasi profil" — ini terjadi karena <Link>
 * milik Next.js melakukan prefetch di background dan menyimpan hasilnya ke
 * Router Cache (~30 detik). Saat pindah ke /profil/[username], Next kadang
 * menampilkan apa pun yang masih ter-resolve dari cache (termasuk state
 * beranda) sebelum akhirnya swap ke skeleton /profil/[username]/loading.tsx
 * yang benar. Ini perilaku default Next.js seputar prefetch, bukan sesuatu
 * yang bisa "dimatikan" murni lewat pengaturan file loading.tsx.
 *
 * Solusi di komponen ini: tangkap klik ke <a href> secara global (capture
 * phase, sebelum router Next sempat bereaksi), lalu SEGERA cat overlay
 * skeleton yang benar langsung lewat DOM API (bukan lewat React state),
 * supaya tercat di frame yang SAMA dengan klik — tidak ada celah waktu
 * untuk konten lama/loading.tsx bawaan Next ter-paint duluan dan
 * menyebabkan kedipan.
 *
 * (Catatan: kasus "tidak ada animasi saat refresh/kunjungan pertama"
 * ditangani terpisah lewat skeleton HTML+CSS murni di app/layout.tsx yang
 * tercat sebelum JavaScript apa pun berjalan — lihat komentar di sana.)
 */
export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const [overlay, setOverlay] = useState<{ path: string; node: React.ReactNode } | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const shownAtRef = useRef<number>(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kasus 1: klik navigasi. Tangkap di capture phase, lalu SEGERA cat
  // overlay lewat DOM langsung (sebelum React sempat re-render), supaya
  // tidak ada celah untuk beranda/loading.tsx bawaan Next ter-paint duluan.
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

      const node = skeletonForPath(targetPath);
      paintSyncOverlay(node); // tercat SEKARANG, di frame yang sama dengan klik
      pendingPathRef.current = targetPath;
      setOverlay({ path: targetPath, node });
      shownAtRef.current = Date.now();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }

    document.addEventListener("click", onClickCapture, { capture: true });

    function onAnnounced(e: Event) {
      const targetPath = (e as CustomEvent<{ targetPath: string }>).detail?.targetPath;
      if (!targetPath || targetPath === pathname) return;
      const node = skeletonForPath(targetPath);
      paintSyncOverlay(node);
      pendingPathRef.current = targetPath;
      setOverlay({ path: targetPath, node });
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

    hideTimeoutRef.current = setTimeout(() => {
      clearSyncOverlay();
      setOverlay(null);
    }, remaining);
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [pathname]);

  // Jaring pengaman: jangan biarkan overlay macet kalau navigasi dibatalkan
  // (mis. pengguna menekan tombol back di tengah jalan) atau gagal.
  useEffect(() => {
    if (!overlay) return;
    const safety = setTimeout(() => {
      clearSyncOverlay();
      setOverlay(null);
    }, 4000);
    return () => clearTimeout(safety);
  }, [overlay]);

  // Komponen React ini sendiri tidak lagi menggambar apa pun ke DOM biasa —
  // elemen overlay yang benar-benar terlihat adalah #utas-sync-route-overlay
  // yang dipasang síncron di atas. State `overlay` di sini hanya dipakai
  // untuk melacak kapan harus disembunyikan (durasi minimum, jaring
  // pengaman, dst). React tidak perlu me-render ulang apa pun ke portal
  // supaya tidak ada risiko flush render yang telat.
  return null;
}
