import { createClient } from "@/lib/supabase/server";
import { getPostsByHashtag } from "@/lib/queries/posts";
import { PageHeader } from "@/components/page-header";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";
import { Hash } from "lucide-react";

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const posts = await getPostsByHashtag(supabase, tag, user?.id);

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title={`#${tag}`} backHref="/" />

      {posts.length === 0 ? (
        <div className="px-4 py-24 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <Hash size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-5 font-display text-[18px] font-bold tracking-[-0.01em] text-white">
            Belum ada utas dengan tag ini
          </p>
          <p className="mt-1.5 text-[14.5px] text-[var(--color-text-dim)]">
            Jadi yang pertama pakai #{tag}.
          </p>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} currentUserId={user?.id} />)
      )}

      <BottomNav />
    </div>
  );
}
