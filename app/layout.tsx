import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { UnreadProvider } from "@/components/unread-provider";
import { CallProvider } from "@/components/call-provider";
import { RouteTransitionOverlay } from "@/components/route-transition-overlay";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Utas",
  description: "Ruang buat nulis dan nyambung, sekarang juga.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#08090B",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Hanya profil ringkas (1 query) yang masih diambil di sini karena
  // dibutuhkan CallProvider & UI secara sinkron. Hitungan unread notifikasi
  // & pesan sengaja TIDAK diambil di layout lagi — itu dua query tambahan
  // yang dulu ikut memblokir setiap navigasi, sehingga loading.tsx tiap
  // halaman jarang sempat tampil. Sekarang diambil oleh UnreadProvider di
  // client setelah mount.
  const profileResult = user
    ? await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single()
    : { data: null };

  return (
    <html lang="id" className="h-full">
      <body className="min-h-full antialiased">
        {/*
          Skeleton beranda murni HTML+CSS, dirender sebagai bagian dari
          response HTML awal — jadi tercat oleh browser SEBELUM satu baris
          JavaScript pun (termasuk React/hydration) sempat berjalan. Ini
          untuk kasus "tidak ada animasi saat refresh/kunjungan pertama":
          RouteTransitionOverlay (client component) baru bisa bereaksi
          setelah hydrasi, yang sudah terlambat untuk first paint. Elemen
          ini dihapus oleh <script> kecil di bawah setelah durasi singkat,
          tidak bergantung pada React sama sekali.
        */}
        <div
          id="utas-boot-skeleton"
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000" }}
        >
          <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
            <div className="h-[56px] border-b border-[var(--color-border)]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b border-[var(--color-border)] px-4 py-4">
                <div className="h-10 w-10 shrink-0 rounded-full animate-shimmer" />
                <div className="flex-1 space-y-2.5 py-0.5">
                  <div className="h-3 w-24 rounded animate-shimmer" />
                  <div className="h-3 w-full rounded animate-shimmer" />
                  <div className="h-3 w-2/3 rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <script
          // Dijalankan síncron saat parser HTML sampai di sini — tidak
          // menunggu React/hydration. Skeleton disembunyikan setelah
          // window "load" (semua aset selesai) ATAU setelah 260ms, mana
          // pun yang lebih dulu, supaya animasi tetap terasa tapi tidak
          // pernah menggantung kalau ada aset yang lambat.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var el = document.getElementById('utas-boot-skeleton');
                if (!el) return;
                var hidden = false;
                function hide() {
                  if (hidden) return;
                  hidden = true;
                  if (el && el.parentNode) el.parentNode.removeChild(el);
                }
                window.addEventListener('load', hide, { once: true });
                setTimeout(hide, 260);
              })();
            `,
          }}
        />
        <RouteTransitionOverlay />
        <UnreadProvider userId={user?.id} myProfile={profileResult.data}>
          <CallProvider
            userId={user?.id}
            selfInfo={
              profileResult.data && user
                ? {
                    id: user.id,
                    username: profileResult.data.username,
                    displayName: profileResult.data.display_name,
                    avatarUrl: profileResult.data.avatar_url,
                  }
                : undefined
            }
          >
            <ToastProvider>{children}</ToastProvider>
          </CallProvider>
        </UnreadProvider>
      </body>
    </html>
  );
}
