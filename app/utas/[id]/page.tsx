import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getThread } from "@/lib/queries/posts";
import { incrementPostView } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { ThreadView } from "@/components/thread-view";
import { BottomNav } from "@/components/bottom-nav";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { post, replies } = await getThread(supabase, id, user?.id);

  if (!post) notFound();

  // Fire-and-forget: tidak di-await supaya tidak memperlambat render halaman.
  // Kegagalan increment view tidak kritis, cukup diabaikan.
  incrementPostView(id).catch(() => {});

  let myProfile: { id: string; username: string; display_name: string; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", user.id).single();
    myProfile = data;
  }

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Utas" backHref="/" />

      <ThreadView initialPost={post} initialReplies={replies} currentUserId={user?.id} myProfile={myProfile} />

      <BottomNav />
    </div>
  );
}
