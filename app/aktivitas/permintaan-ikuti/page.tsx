import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BottomNav } from "@/components/bottom-nav";
import { FollowRequestList } from "@/components/follow-request-list";

export default async function PermintaanIkutiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: requests } = await supabase
    .from("follow_requests")
    .select(
      `requester_id, created_at,
       requester:profiles!follow_requests_requester_id_fkey(username, display_name, avatar_url, is_verified)`
    )
    .eq("target_id", user.id)
    .order("created_at", { ascending: false });

  const initialRequests = (requests ?? []).map((r) => ({
    requester_id: r.requester_id as string,
    created_at: r.created_at as string,
    requester: r.requester as unknown as {
      username: string;
      display_name: string;
      avatar_url: string | null;
      is_verified: boolean;
    },
  }));

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Permintaan ikuti" backHref="/aktivitas" />
      <FollowRequestList initialRequests={initialRequests} />
      <BottomNav />
    </div>
  );
}
