import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserPosts } from "@/lib/queries/posts";
import { PageHeader } from "@/components/page-header";
import { PostCard } from "@/components/post-card";
import { FollowButton } from "@/components/follow-button";
import { MessageButton } from "@/components/message-button";
import { FollowerCounts } from "@/components/follower-counts";
import { ProfileOptionsMenu } from "@/components/profile-options-menu";
import { BottomNav } from "@/components/bottom-nav";
import { Settings, Bookmark, Ban, FileText } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!profile) notFound();

  const isOwnProfile = user?.id === profile.id;

  let viewerIsAdmin = false;
  if (user && !isOwnProfile) {
    const { data: viewerProfile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    viewerIsAdmin = viewerProfile?.is_admin === true;
  }

  let iBlockedThem = false;
  let theyBlockedMe = false;
  let iMutedThem = false;
  if (user && !isOwnProfile) {
    const [{ data: myBlock }, { data: theirBlock }, { data: myMute }] = await Promise.all([
      supabase.from("blocks").select("blocker_id").eq("blocker_id", user.id).eq("blocked_id", profile.id).maybeSingle(),
      supabase.from("blocks").select("blocker_id").eq("blocker_id", profile.id).eq("blocked_id", user.id).maybeSingle(),
      supabase.from("mutes").select("muter_id").eq("muter_id", user.id).eq("muted_id", profile.id).maybeSingle(),
    ]);
    iBlockedThem = !!myBlock;
    theyBlockedMe = !!theirBlock;
    iMutedThem = !!myMute;
  }

  // Kalau salah satu pihak memblokir, sembunyikan konten profil sepenuhnya.
  // Ditangani di aplikasi (bukan RLS) sesuai aturan query yang didokumentasikan
  // di README — RLS profiles/posts tetap sederhana dan stabil.
  if (theyBlockedMe) {
    return (
      <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
        <PageHeader title={profile.username} backHref="/" />
        <div className="px-4 py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <Ban size={26} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-5 font-display text-[17px] font-bold text-white">Profil tidak tersedia</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  const [{ count: followerCount }, { count: followingCount }, posts] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    iBlockedThem ? Promise.resolve([]) : getUserPosts(supabase, profile.id, user?.id),
  ]);

  let isFollowing = false;
  if (user && !isOwnProfile) {
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle();
    isFollowing = !!data;
  }

  const pinnedPost = posts.find((p) => p.pinned_at);
  const regularPosts = posts.filter((p) => !p.pinned_at);

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader
        title={profile.username}
        backHref="/"
        action={
          isOwnProfile ? (
            <div className="flex items-center gap-1">
              <Link
                href={`/tulis/draft?from=/profil/${username}`}
                aria-label="Draft"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
              >
                <FileText size={18} strokeWidth={2} />
              </Link>
              <Link
                href="/tersimpan"
                aria-label="Tersimpan"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
              >
                <Bookmark size={18} strokeWidth={2} />
              </Link>
              <Link
                href="/pengaturan-profil"
                aria-label="Pengaturan profil"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
              >
                <Settings size={19} strokeWidth={2} />
              </Link>
            </div>
          ) : user ? (
            <ProfileOptionsMenu
              targetUserId={profile.id}
              targetUsername={profile.username}
              initiallyBlocked={iBlockedThem}
              initiallyMuted={iMutedThem}
              isAdmin={viewerIsAdmin}
              targetIsVerified={profile.is_verified}
            />
          ) : null
        }
      />

      <div className="px-4 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 pt-1">
            <h2 className="flex items-center gap-1.5 font-display text-[22px] font-extrabold tracking-[-0.015em] text-white">
              {profile.display_name}
              {profile.is_verified && <VerifiedBadge size={18} />}
            </h2>
            <p className="mt-0.5 text-[14.5px] text-[var(--color-text-dim)]">@{profile.username}</p>
          </div>
          <Avatar username={profile.username} displayName={profile.display_name} avatarUrl={profile.avatar_url} size="lg" />
        </div>

        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-white">
            {profile.bio}
          </p>
        )}

        <FollowerCounts
          profileId={profile.id}
          initialFollowerCount={followerCount ?? 0}
          initialFollowingCount={followingCount ?? 0}
        />

        {!isOwnProfile && !iBlockedThem && (
          <div className="mt-5 flex items-center gap-2.5">
            <div className="flex-1">
              <FollowButton
                targetUserId={profile.id}
                initiallyFollowing={isFollowing}
                isLoggedIn={!!user}
              />
            </div>
            <MessageButton targetUserId={profile.id} isLoggedIn={!!user} />
          </div>
        )}
      </div>

      {iBlockedThem ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[14.5px] text-[var(--color-text-dim)]">
            Kamu memblokir akun ini. Buka blokir untuk melihat utasnya.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b border-white/20 px-4 pb-3">
            <span className="text-[14.5px] font-bold text-white">Utas</span>
          </div>

          {posts.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[14.5px] text-[var(--color-text-dim)]">
                {isOwnProfile ? "Kamu belum menulis apa-apa." : "Belum ada postingan."}
              </p>
            </div>
          ) : (
            <>
              {pinnedPost && <PostCard key={pinnedPost.id} post={pinnedPost} currentUserId={user?.id} />}
              {regularPosts.map((post) => <PostCard key={post.id} post={post} currentUserId={user?.id} />)}
            </>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}
