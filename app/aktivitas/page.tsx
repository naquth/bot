import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BottomNav } from "@/components/bottom-nav";
import { MarkReadOnMount } from "@/components/mark-read-on-mount";
import { NotificationList } from "@/components/notification-list";

export default async function AktivitasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: notifs } = await supabase
    .from("notifications")
    .select(
      `id, type, read, created_at, post_id,
       actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)`
    )
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initialNotifs = (notifs ?? []).map((n) => ({
    id: n.id as string,
    type: n.type as "like" | "reply" | "follow" | "mention" | "quote",
    read: n.read as boolean,
    created_at: n.created_at as string,
    post_id: n.post_id as string | null,
    actor: n.actor as unknown as { id: string; username: string; display_name: string; avatar_url: string | null },
  }));

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Aktivitas" />

      <NotificationList initialNotifs={initialNotifs} userId={user.id} />

      <BottomNav />
      <MarkReadOnMount />
    </div>
  );
}
