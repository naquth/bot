"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mail, Sparkles, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { createClient } from "@/lib/supabase/client";

type Member = { id: string; username: string; display_name: string; avatar_url: string | null };

export type ConversationRow = {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatarUrl: string | null;
  otherMembers: Member[];
  memberCount: number;
  lastMsg: { content: string; image_url?: string | null; audio_url?: string | null; sender_id: string; read: boolean; created_at: string } | undefined;
  hasUnread: boolean;
  lastMessageAt: string;
};

export function ConversationList({
  initialRows,
  currentUserId,
}: {
  initialRows: ConversationRow[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation-list:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          image_url?: string | null;
          audio_url?: string | null;
          created_at: string;
        };

        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === msg.conversation_id);
          if (idx === -1) return prev; // percakapan ini bukan milik user ini, RLS akan menolak lebih lanjut jika dicoba fetch

          const updated: ConversationRow = {
            ...prev[idx],
            lastMsg: {
              content: msg.content,
              image_url: msg.image_url,
              audio_url: msg.audio_url,
              sender_id: msg.sender_id,
              read: false,
              created_at: msg.created_at,
            },
            lastMessageAt: msg.created_at,
            hasUnread: msg.sender_id !== currentUserId ? true : prev[idx].hasUnread,
          };

          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  if (rows.length === 0) {
    return (
      <>
        <AiAssistantEntry />
        <div className="px-4 py-20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <Mail size={22} strokeWidth={1.75} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-4 font-display text-[17px] font-semibold text-white">Belum ada pesan</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[14px] text-[var(--color-text-dim)]">
            Kirim pesan langsung ke seseorang lewat profilnya, atau buat grup untuk mengobrol bareng banyak orang.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <AiAssistantEntry />
      {rows.map((r) => {
        const title = r.isGroup ? r.groupName ?? "Grup" : (r.otherMembers[0]?.display_name ?? "Pengguna");
        const preview = r.lastMsg?.audio_url
          ? "🎤 Voice note"
          : r.lastMsg?.image_url && !r.lastMsg.content
            ? "📷 Foto"
            : r.lastMsg?.content || "Belum ada pesan";
        const previewWithSender =
          r.isGroup && r.lastMsg
            ? `${r.lastMsg.sender_id === currentUserId ? "Kamu" : (r.otherMembers.find((m) => m.id === r.lastMsg?.sender_id)?.display_name ?? "").split(" ")[0]}: ${preview}`
            : preview;

        return (
          <Link
            key={r.id}
            href={`/pesan/${r.id}`}
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 transition-colors active:bg-white/[0.03]"
          >
            {r.isGroup ? (
              <GroupAvatar name={r.groupName ?? "Grup"} avatarUrl={r.groupAvatarUrl} members={r.otherMembers} />
            ) : (
              <Avatar
                username={r.otherMembers[0]?.username ?? ""}
                displayName={title}
                avatarUrl={r.otherMembers[0]?.avatar_url}
                size="list"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] font-bold text-white">{title}</p>
                  {r.isGroup && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">
                      <Users size={9} strokeWidth={2.5} />
                      Grup
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[12.5px] text-[var(--color-text-faint)]">
                  <RelativeTime dateStr={r.lastMessageAt} />
                </span>
              </div>
              <p
                className={`mt-0.5 truncate text-[13.5px] ${
                  r.hasUnread ? "font-semibold text-white" : "text-[var(--color-text-dim)]"
                }`}
              >
                {r.isGroup ? previewWithSender : preview}
              </p>
            </div>
            {r.hasUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />}
          </Link>
        );
      })}
    </>
  );
}

function GroupAvatar({ name, avatarUrl, members }: { name: string; avatarUrl: string | null; members: Member[] }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/[0.08]" />;
  }

  if (members.length >= 2) {
    return (
      <div className="relative h-12 w-12 shrink-0">
        <Avatar username={members[0].username} displayName={members[0].display_name} avatarUrl={members[0].avatar_url} size="sm" />
        <div className="absolute bottom-0 right-0 ring-2 ring-black rounded-full">
          <Avatar username={members[1].username} displayName={members[1].display_name} avatarUrl={members[1].avatar_url} size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-3)] ring-1 ring-white/[0.08]">
      <Users size={19} strokeWidth={1.75} className="text-[var(--color-text-dim)]" />
    </div>
  );
}

function AiAssistantEntry() {
  return (
    <Link
      href="/asisten"
      className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 transition-colors active:bg-white/[0.03]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 ring-1 ring-white/[0.08]">
        <Sparkles size={20} strokeWidth={2.25} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-white">Asisten AI</p>
        <p className="mt-0.5 truncate text-[13.5px] text-[var(--color-text-dim)]">
          Tanya apa saja atau minta ide post
        </p>
      </div>
    </Link>
  );
}
