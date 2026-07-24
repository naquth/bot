import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { GroupInfo } from "@/components/group-info";

export default async function GroupInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, is_group, name, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (!conversation || !conversation.is_group) notFound();

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id, is_admin, joined_at, profiles(id, username, display_name, avatar_url)")
    .eq("conversation_id", id)
    .order("joined_at", { ascending: true });

  const members = (participants ?? [])
    .map((p) => ({
      ...(p.profiles as unknown as { id: string; username: string; display_name: string; avatar_url: string | null }),
      isAdmin: p.is_admin as boolean,
    }))
    .filter(Boolean);

  const me = members.find((m) => m.id === user.id);
  if (!me) notFound();

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <PageHeader title="Info Grup" backHref={`/pesan/${id}`} />
      <GroupInfo
        conversationId={id}
        currentUserId={user.id}
        isAdmin={me.isAdmin}
        groupName={conversation.name as string}
        groupAvatarUrl={conversation.avatar_url as string | null}
        members={members}
      />
    </div>
  );
}
