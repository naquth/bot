import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, getFollowingFeed } from "@/lib/queries/posts";
import { getStoryTray } from "@/lib/queries/stories";
import { getBlockedUserIds, getMutedUserIds } from "@/app/actions";
import { BottomNav } from "@/components/bottom-nav";
import { FeedTabs } from "@/components/feed-tabs";
import { StoryTray } from "@/components/story-tray";
import type { Profile } from "@/lib/types";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let myProfile: Profile | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    myProfile = data;
  }

  const [blockedUserIds, mutedUserIds] = user
    ? await Promise.all([getBlockedUserIds(), getMutedUserIds()])
    : [[], []];
  const hiddenUserIds = [...new Set([...blockedUserIds, ...mutedUserIds])];

  const { posts, failed } = await getFeedPosts(supabase, user?.id, 30, hiddenUserIds);
  const followingResult = user
    ? await getFollowingFeed(supabase, user.id, 30, hiddenUserIds)
    : { posts: [], failed: false };
  const storyGroups = user ? await getStoryTray(supabase, user.id, hiddenUserIds) : [];

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      {failed ? (
        <>
          <header className="sticky top-0 z-30 flex h-[52px] items-center justify-center border-b border-[var(--color-border)] bg-black/85 backdrop-blur-xl backdrop-saturate-150">
            <Image src="/logo-mark.png" alt="Utas" width={36} height={36} priority />
          </header>
          <div className="px-4 py-16 text-center">
            <p className="font-display text-[16px] font-bold text-white">Gagal memuat utas</p>
            <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">
              Ada masalah saat mengambil data. Coba muat ulang halaman.
            </p>
          </div>
          <BottomNav />
        </>
      ) : (
        <FeedTabs
          initialForYouPosts={posts}
          initialFollowingPosts={followingResult.posts}
          followingFailed={followingResult.failed}
          currentUserId={user?.id}
          isLoggedIn={!!user}
          myProfile={myProfile}
          topSlot={
            <>
              {user && myProfile && <StoryTray groups={storyGroups} currentUser={myProfile} />}
              {!user && (
                <div className="border-b border-[var(--color-border)] px-4 py-8 text-center">
                  <p className="text-[14.5px] leading-relaxed text-[var(--color-text-dim)]">
                    <Link href="/masuk" className="font-bold text-white hover:underline">
                      Masuk
                    </Link>{" "}
                    untuk mulai nulis dan ikut nyambung.
                  </p>
                </div>
              )}
            </>
          }
        />
      )}

      <BottomNav />
    </div>
  );
}
