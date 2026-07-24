import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus, ChevronRight } from "lucide-react";
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

  const { count: pendingRequestCount } = await supabase
    .from("follow_requests")
    .select("*", { count: "exact", head: true })
    .eq("target_id", user.id);

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

      {!!pendingRequestCount && pendingRequestCount > 0 && (
        <Link
          href="/aktivitas/permintaan-ikuti"
          className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5 transition-colors active:bg-white/[0.04]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4A9EFF]/15 text-[#4A9EFF]">
            <UserPlus size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold text-white">Permintaan ikuti</p>
            <p className="truncate text-[13.5px] text-[var(--color-text-dim)]">
              {pendingRequestCount} permintaan menunggu persetujuanmu
            </p>
          </div>
          <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-[var(--color-text-faint)]" />
        </Link>
      )}

      <NotificationList initialNotifs={initialNotifs} userId={user.id} />

      <BottomNav />
      <MarkReadOnMount />
    </div>
  );
}
