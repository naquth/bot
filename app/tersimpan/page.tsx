import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedPosts } from "@/lib/queries/posts";
import { PageHeader } from "@/components/page-header";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";

export default async function TersimpanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const posts = await getBookmarkedPosts(supabase, user.id);

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Tersimpan" backHref="/profil" />

      {posts.length === 0 ? (
        <div className="px-4 py-24 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <Bookmark size={26} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-5 font-display text-[18px] font-bold tracking-[-0.01em] text-white">
            Belum ada yang disimpan
          </p>
          <p className="mt-1.5 text-[14.5px] text-[var(--color-text-dim)]">
            Ketuk ikon simpan pada utas untuk menyimpannya di sini.
          </p>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} currentUserId={user.id} />)
      )}

      <BottomNav />
    </div>
  );
}
