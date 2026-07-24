"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadMessageCountAction } from "@/app/actions";

type MyProfile = { username: string; display_name: string; avatar_url: string | null };

type UnreadContextValue = {
  unreadNotifications: number;
  unreadMessages: number;
  resetNotifications: () => void;
  refreshUnreadMessages: () => Promise<void>;
  myProfile: MyProfile | null;
};

const UnreadContext = createContext<UnreadContextValue>({
  unreadNotifications: 0,
  unreadMessages: 0,
  resetNotifications: () => {},
  refreshUnreadMessages: async () => {},
  myProfile: null,
});

export function useUnread() {
  return useContext(UnreadContext);
}

export function UnreadProvider({
  userId,
  initialNotifications,
  initialMessages,
  myProfile,
  children,
}: {
  userId?: string;
  initialNotifications: number;
  initialMessages: number;
  myProfile: MyProfile | null;
  children: React.ReactNode;
}) {
  const [unreadNotifications, setUnreadNotifications] = useState(initialNotifications);
  const [unreadMessages, setUnreadMessages] = useState(initialMessages);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    // Notifikasi: RLS "recipient_id = auth.uid()" sudah membatasi baris yang
    // diterima client hanya milik user ini, aman untuk filter server-side.
    const notifChannel = supabase
      .channel(`unread-notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => setUnreadNotifications((c) => c + 1)
      )
      .subscribe();

    // Pesan: tabel messages tidak punya kolom recipient_id untuk difilter
    // langsung, jadi kita dengarkan semua insert lalu re-fetch hitungan lewat
    // server action yang sudah membatasi query dengan RLS conversations milik
    // user ini. Ini menghindari kebocoran isi pesan orang lain ke client.
    const msgChannel = supabase
      .channel(`unread-messages:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async () => {
        const count = await getUnreadMessageCountAction();
        setUnreadMessages(count);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [userId]);

  const refreshUnreadMessages = useCallback(async () => {
    const count = await getUnreadMessageCountAction();
    setUnreadMessages(count);
  }, []);

  const resetNotifications = useCallback(() => setUnreadNotifications(0), []);

  return (
    <UnreadContext.Provider
      value={{
        unreadNotifications,
        unreadMessages,
        resetNotifications,
        refreshUnreadMessages,
        myProfile,
      }}
    >
      {children}
    </UnreadContext.Provider>
  );
}
