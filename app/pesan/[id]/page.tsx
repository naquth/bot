import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/components/chat-thread";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, is_group, name, avatar_url, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id, is_admin, profiles(id, username, display_name, avatar_url)")
    .eq("conversation_id", id);

  const allMembers = (participants ?? [])
    .map((p) => ({
      ...(p.profiles as unknown as { id: string; username: string; display_name: string; avatar_url: string | null }),
      isAdmin: p.is_admin as boolean,
    }))
    .filter(Boolean);

  const myMembership = allMembers.find((m) => m.id === user.id);
  if (!myMembership) notFound();

  const otherMembers = allMembers.filter((m) => m.id !== user.id);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, content, image_url, image_width, image_height, audio_url, audio_duration_sec, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <ChatThread
        conversationId={id}
        currentUserId={user.id}
        isGroup={conversation.is_group as boolean}
        groupName={conversation.name as string | null}
        groupAvatarUrl={conversation.avatar_url as string | null}
        otherUser={otherMembers[0] ?? null}
        members={allMembers}
        initialMessages={messages ?? []}
      />
    </div>
  );
}
