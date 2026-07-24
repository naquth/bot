import { redirect } from "next/navigation";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BottomNav } from "@/components/bottom-nav";
import { ConversationList, type ConversationRow } from "@/components/conversation-list";

export default async function PesanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: myParticipations } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  const convIds = (myParticipations ?? []).map((p) => p.conversation_id as string);

  if (convIds.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
        <PageHeader
          title="Pesan"
          backHref="/"
          action={
            <Link
              href="/pesan/grup-baru"
              aria-label="Buat grup baru"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
            >
              <UsersRound size={20} strokeWidth={2} />
            </Link>
          }
        />
        <ConversationList initialRows={[]} currentUserId={user.id} />
        <BottomNav />
      </div>
    );
  }

  const [{ data: conversations }, { data: allParticipants }] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        `id, is_group, name, avatar_url, last_message_at,
         messages(content, image_url, audio_url, sender_id, read, created_at)`
      )
      .in("id", convIds)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user_id, profiles(id, username, display_name, avatar_url)")
      .in("conversation_id", convIds),
  ]);

  const participantsByConv = new Map<string, { id: string; username: string; display_name: string; avatar_url: string | null }[]>();
  for (const row of allParticipants ?? []) {
    const convId = row.conversation_id as string;
    const profile = row.profiles as unknown as { id: string; username: string; display_name: string; avatar_url: string | null } | null;
    if (!profile || profile.id === user.id) continue;
    const list = participantsByConv.get(convId) ?? [];
    list.push(profile);
    participantsByConv.set(convId, list);
  }

  const rows: ConversationRow[] = (conversations ?? []).map((c) => {
    const otherMembers = participantsByConv.get(c.id as string) ?? [];
    const msgs =
      (c.messages as { content: string; image_url: string | null; audio_url: string | null; sender_id: string; read: boolean; created_at: string }[]) ?? [];
    const lastMsg = msgs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const hasUnread = msgs.some((m) => !m.read && m.sender_id !== user.id);

    return {
      id: c.id as string,
      isGroup: c.is_group as boolean,
      groupName: c.name as string | null,
      groupAvatarUrl: c.avatar_url as string | null,
      otherMembers,
      memberCount: otherMembers.length + 1,
      lastMsg,
      hasUnread,
      lastMessageAt: c.last_message_at as string,
    };
  });

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader
        title="Pesan"
        backHref="/"
        action={
          <Link
            href="/pesan/grup-baru"
            aria-label="Buat grup baru"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
          >
            <UsersRound size={20} strokeWidth={2} />
          </Link>
        }
      />
      <ConversationList initialRows={rows} currentUserId={user.id} />
      <BottomNav />
    </div>
  );
}
