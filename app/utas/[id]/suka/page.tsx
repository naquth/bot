import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";

export default async function LikesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase.from("posts").select("id").eq("id", id).maybeSingle();
  if (!post) notFound();

  const { data: likes } = await supabase
    .from("likes")
    .select("user:profiles!likes_user_id_fkey(id, username, display_name, avatar_url)")
    .eq("post_id", id)
    .order("created_at", { ascending: false });

  const users = (likes ?? []).map(
    (l) => l.user as unknown as { id: string; username: string; display_name: string; avatar_url: string | null }
  );

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <PageHeader title="Disukai" backHref={`/utas/${id}`} />

      {users.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[14.5px] text-[var(--color-text-dim)]">Belum ada yang menyukai utas ini.</p>
        </div>
      ) : (
        users.map((u) => (
          <Link
            key={u.id}
            href={`/profil/${u.username}`}
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 transition-colors active:bg-white/[0.03]"
          >
            <Avatar username={u.username} displayName={u.display_name} avatarUrl={u.avatar_url} size="list" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-white">{u.display_name}</p>
              <p className="truncate text-[14px] text-[var(--color-text-dim)]">@{u.username}</p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
