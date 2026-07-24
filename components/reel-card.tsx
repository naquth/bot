"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Bookmark, Share2, Volume2, VolumeX, Pause } from "lucide-react";
import { toggleLike, toggleBookmark } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { PostText } from "@/components/post-text";
import { VerifiedBadge } from "@/components/verified-badge";
import { useToast } from "@/components/toast";
import type { Post } from "@/lib/types";

export function ReelCard({
  post,
  currentUserId,
  isActive,
}: {
  post: Post;
  currentUserId?: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [bookmarked, setBookmarked] = useState(post.bookmarked_by_me);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [likePopping, setLikePopping] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive]);

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : c - 1));
    if (next) {
      setLikePopping(true);
      setTimeout(() => setLikePopping(false), 400);
    }
    startTransition(async () => {
      const ok = await toggleLike(post.id, next);
      if (!ok) {
        setLiked(!next);
        setLikeCount((c) => (next ? c - 1 : c + 1));
      }
    });
  }

  function handleBookmark() {
    if (!currentUserId) return;
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const ok = await toggleBookmark(post.id, next);
      if (!ok) setBookmarked(!next);
      else showToast(next ? "Disimpan" : "Batal disimpan");
    });
  }

  function handleShare() {
    const url = `${window.location.origin}/utas/${post.id}`;
    navigator.clipboard.writeText(url).then(() => showToast("Tautan disalin"));
  }

  function handleVideoTap() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={post.video_url ?? undefined}
        poster={post.video_thumbnail_url ?? undefined}
        muted={muted}
        loop
        playsInline
        onClick={handleVideoTap}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="h-full w-full object-contain"
      />

      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40">
            <Pause size={28} className="fill-white text-white" />
          </div>
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
        className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        style={{ top: "max(16px, env(safe-area-inset-top))" }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Overlay gradasi bawah untuk keterbacaan teks */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Info user + caption, kiri bawah */}
      <div className="absolute bottom-0 left-0 right-16 p-4 pb-8">
        <Link href={`/profil/${post.author.username}`} className="flex items-center gap-2.5">
          <Avatar username={post.author.username} displayName={post.author.display_name} avatarUrl={post.author.avatar_url} size="sm" />
          <span className="text-[14.5px] font-bold text-white">{post.author.username}</span>
          {post.author.is_verified && <VerifiedBadge size={14} />}
        </Link>
        {post.content && (
          <div className="mt-2 line-clamp-3">
            <PostText content={post.content} />
          </div>
        )}
      </div>

      {/* Action buttons, kanan bawah */}
      <div className="absolute bottom-8 right-3 flex flex-col items-center gap-5">
        <button
          onClick={handleLike}
          disabled={isPending}
          aria-label={liked ? "Batal suka" : "Suka"}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <Heart
            size={28}
            strokeWidth={2}
            fill={liked ? "var(--color-like)" : "none"}
            className={`${liked ? "text-[var(--color-like)]" : "text-white"} ${likePopping ? "animate-heart-pop" : ""}`}
          />
          <span className="text-[12px] font-bold text-white">{likeCount}</span>
        </button>

        <button
          onClick={() => router.push(`/utas/${post.id}`)}
          aria-label="Balas"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <MessageCircle size={27} strokeWidth={2} className="text-white" />
          <span className="text-[12px] font-bold text-white">{post.reply_count}</span>
        </button>

        <button
          onClick={handleBookmark}
          disabled={isPending || !currentUserId}
          aria-label={bookmarked ? "Batal simpan" : "Simpan"}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-50"
        >
          <Bookmark size={26} strokeWidth={2} fill={bookmarked ? "white" : "none"} className="text-white" />
        </button>

        <button
          onClick={handleShare}
          aria-label="Bagikan"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <Share2 size={25} strokeWidth={2} className="text-white" />
        </button>
      </div>
    </div>
  );
}
