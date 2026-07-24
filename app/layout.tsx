import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { UnreadProvider } from "@/components/unread-provider";
import { CallProvider } from "@/components/call-provider";
import { createClient } from "@/lib/supabase/server";
import { getUnreadCount, getUnreadMessageCount } from "@/lib/queries/posts";

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

  const [unreadNotifications, unreadMessages, profileResult] = await Promise.all([
    getUnreadCount(supabase, user?.id),
    getUnreadMessageCount(supabase, user?.id),
    user ? supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single() : Promise.resolve({ data: null }),
  ]);

  return (
    <html lang="id" className="h-full">
      <body className="min-h-full antialiased">
        <UnreadProvider
          userId={user?.id}
          initialNotifications={unreadNotifications}
          initialMessages={unreadMessages}
          myProfile={profileResult.data}
        >
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
