"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, MessageCircle, UserPlus, Bell, AtSign, Repeat2, Lock } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { createClient } from "@/lib/supabase/client";

type NotifType = "like" | "reply" | "follow" | "mention" | "quote" | "follow_request" | "follow_accept";

type Notif = {
  id: string;
  type: NotifType;
  read: boolean;
  created_at: string;
  post_id: string | null;
  actor: { id: string; username: string; display_name: string; avatar_url: string | null };
};

const ICONS = {
  like: { Icon: Heart, className: "text-[var(--color-like)]", fill: "var(--color-like)" },
  reply: { Icon: MessageCircle, className: "text-white", fill: "none" },
  follow: { Icon: UserPlus, className: "text-white", fill: "none" },
  mention: { Icon: AtSign, className: "text-white", fill: "none" },
  quote: { Icon: Repeat2, className: "text-white", fill: "none" },
  follow_request: { Icon: Lock, className: "text-[#4A9EFF]", fill: "none" },
  follow_accept: { Icon: UserPlus, className: "text-white", fill: "none" },
};

const LABELS = {
  like: "menyukai utasmu",
  reply: "membalas utasmu",
  follow: "mulai mengikutimu",
  mention: "menyebutmu di sebuah utas",
  quote: "mengulang unggah utasmu",
  follow_request: "meminta mengikutimu",
  follow_accept: "menerima permintaan ikutimu",
};

export function NotificationList({ initialNotifs, userId }: { initialNotifs: Notif[]; userId: string }) {
  const [notifs, setNotifs] = useState(initialNotifs);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          const raw = payload.new as {
            id: string;
            type: NotifType;
            read: boolean;
            created_at: string;
            post_id: string | null;
            actor_id: string;
          };

          const { data: actor } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", raw.actor_id)
            .maybeSingle();

          if (!actor) return;

          setNotifs((prev) => [
            {
              id: raw.id,
              type: raw.type,
              read: raw.read,
              created_at: raw.created_at,
              post_id: raw.post_id,
              actor,
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (notifs.length === 0) {
    return (
      <div className="px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
          <Bell size={22} strokeWidth={1.75} className="text-[var(--color-text-faint)]" />
        </div>
        <p className="mt-4 font-display text-[17px] font-semibold text-white">Belum ada aktivitas</p>
        <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">
          Interaksi orang lain dengan utasmu akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <>
      {notifs.map((n) => {
        const { Icon, className, fill } = ICONS[n.type];
        const href =
          n.type === "follow_request"
            ? "/aktivitas/permintaan-ikuti"
            : n.type === "follow" || n.type === "follow_accept"
              ? `/profil/${n.actor.username}`
              : n.post_id
                ? `/utas/${n.post_id}`
                : "/";

        return (
          <Link
            key={n.id}
            href={href}
            className={`flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-4 transition-colors active:bg-white/[0.03] ${!n.read ? "bg-white/[0.03]" : ""}`}
          >
            <Icon size={21} strokeWidth={2} fill={fill} className={`mt-0.5 shrink-0 ${className}`} />
            <Avatar username={n.actor.username} displayName={n.actor.display_name} avatarUrl={n.actor.avatar_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] leading-snug text-white">
                <span className="font-bold">{n.actor.username}</span>{" "}
                <span className="text-[var(--color-text-dim)]">{LABELS[n.type]}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--color-text-faint)]"><RelativeTime dateStr={n.created_at} /></p>
            </div>
          </Link>
        );
      })}
    </>
  );
}
