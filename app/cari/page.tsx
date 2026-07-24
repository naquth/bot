import { createClient } from "@/lib/supabase/server";
import { getTrendingPosts } from "@/lib/queries/posts";
import { SearchBox } from "@/components/search-box";
import { PageHeader } from "@/components/page-header";
import { BottomNav } from "@/components/bottom-nav";

export default async function CariPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const trendingPosts = await getTrendingPosts(supabase, user?.id);

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Cari" backHref="/" />
      <SearchBox currentUserId={user?.id} trendingPosts={trendingPosts} />
      <BottomNav />
    </div>
  );
}
