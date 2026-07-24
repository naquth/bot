import { createClient } from "@/lib/supabase/server";
import { getVideoFeed } from "@/lib/queries/posts";
import { ReelsFeed } from "@/components/reels-feed";

export default async function ReelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const posts = await getVideoFeed(supabase, user?.id, 20);

  return <ReelsFeed initialPosts={posts} currentUserId={user?.id} />;
}
