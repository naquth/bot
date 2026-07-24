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
