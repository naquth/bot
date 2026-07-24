"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { announceRouteTransition } from "@/components/route-transition-overlay";
import { Heart, MessageCircle, Repeat2, Bookmark, MoreHorizontal, Trash2, Link2, Check, Pencil, Flag, Pin, PinOff } from "lucide-react";
import type { Post } from "@/lib/types";
import { toggleLike, deletePost, toggleBookmark, updatePost, togglePinPost } from "@/app/actions";
import { PostText } from "@/components/post-text";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QuoteComposer } from "@/components/quote-composer";
import { ReportDialog } from "@/components/report-dialog";
import { PollView } from "@/components/poll-view";
import { VerifiedBadge } from "@/components/verified-badge";
import { VideoPlayer } from "@/components/video-player";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { useUnread } from "@/components/unread-provider";
import { VisibilityBadge } from "@/components/visibility-badge";
import { RelativeTime } from "@/components/relative-time";

type PostCardProps = {
  post: Post;
  currentUserId?: string;
  currentUserProfile?: { username: string; display_name: string; avatar_url: string | null };
  clickable?: boolean;
  onDeleted?: (id: string) => void;
};

export function PostCard({ post, currentUserId, currentUserProfile, clickable = true, onDeleted }: PostCardProps) {
  const { myProfile } = useUnread();
  const effectiveProfile = currentUserProfile ?? myProfile ?? undefined;
  const router = useRouter();
  const { showToast } = useToast();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [bookmarked, setBookmarked] = useState(post.bookmarked_by_me);
  const [deleted, setDeleted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [pinned, setPinned] = useState(!!post.pinned_at);
  const [likePopping, setLikePopping] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [displayContent, setDisplayContent] = useState(post.content);
  const [wasEdited, setWasEdited] = useState(!!post.edited_at);
  const [isPending, startTransition] = useTransition();

  const isOwner = currentUserId && currentUserId === post.author_id;

  function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
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

  function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentUserId) return;
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const ok = await toggleBookmark(post.id, next);
      if (!ok) setBookmarked(!next);
      else showToast(next ? "Disimpan" : "Batal disimpan");
    });
  }

  function handleRepostClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentUserId) return;
    setQuoteOpen(true);
  }

  function handleTogglePin(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    const next = !pinned;
    setPinned(next);
    startTransition(async () => {
      const res = await togglePinPost(post.id, next);
      if (!res.ok) {
        setPinned(!next);
        showToast(res.error ?? "Gagal mengubah pin", "error");
      } else {
        showToast(next ? "Utas disematkan di profil" : "Utas dilepas dari sematan");
      }
    });
  }

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setEditContent(displayContent);
    setEditing(true);
  }

  function handleSaveEdit(e: React.MouseEvent) {
    e.stopPropagation();
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === displayContent) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await updatePost(post.id, trimmed);
      if (res.ok) {
        setDisplayContent(trimmed);
        setWasEdited(true);
        setEditing(false);
        showToast("Utas diperbarui");
      } else {
        showToast(res.error ?? "Gagal menyimpan", "error");
      }
    });
  }

  function handleCancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  function handleCopyLink(e: React.MouseEvent) {
    e.stopPropagation();
    const url = `${window.location.origin}/utas/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      showToast("Tautan disalin");
      setTimeout(() => setCopied(false), 1500);
    });
    setMenuOpen(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setConfirmOpen(true);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    startTransition(async () => {
      const ok = await deletePost(post.id);
      if (ok) {
        setDeleted(true);
        onDeleted?.(post.id);
        showToast("Utas dihapus");
      } else {
        showToast("Gagal menghapus utas", "error");
      }
    });
  }

  function handleCardClick() {
    if (clickable) {
      announceRouteTransition(`/utas/${post.id}`);
      router.push(`/utas/${post.id}`);
    }
  }

  if (deleted) return null;

  const actionBtn =
    "flex h-9 items-center justify-center gap-1.5 rounded-full text-[var(--color-text-dim)] transition-all duration-150 active:scale-[0.88] disabled:opacity-40";

  return (
    <article
      onClick={handleCardClick}
      className={`group relative border-b border-[var(--color-border)] px-4 py-4 transition-colors duration-100 active:bg-white/[0.03] ${clickable ? "cursor-pointer" : ""}`}
    >
      {pinned && (
        <div className="mb-2 flex items-center gap-1.5 pl-[52px] text-[13px] font-semibold text-[var(--color-text-faint)]">
          <Pin size={13} strokeWidth={2.5} />
          Disematkan
        </div>
      )}
      <div className="flex gap-3">
        <Link href={`/profil/${post.author.username}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
          <Avatar username={post.author.username} displayName={post.author.display_name} avatarUrl={post.author.avatar_url} size="md" />
        </Link>

        <div className="min-w-0 flex-1">
          {/* Header: nama + waktu + menu */}
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <Link
                href={`/profil/${post.author.username}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-display text-[15.5px] font-bold tracking-[-0.01em] text-white active:opacity-70"
              >
                {post.author.username}
              </Link>
              {post.author.is_verified && <VerifiedBadge />}
              <span className="shrink-0 text-[13px] text-[var(--color-text-faint)]"><RelativeTime dateStr={post.created_at} /></span>
              {wasEdited && <span className="shrink-0 text-[13px] text-[var(--color-text-faint)]">· diedit</span>}
              {post.visibility !== "public" && (
                <VisibilityBadge visibility={post.visibility} />
              )}
            </div>

            <div className="relative shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="Opsi lainnya"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-faint)] transition-colors active:bg-[var(--color-surface-3)]"
              >
                <MoreHorizontal size={17} />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                  />
                  <div className="animate-slide-down absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-[#151517] shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
                    <button
                      onClick={handleCopyLink}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-[14.5px] font-medium text-white transition-colors active:bg-white/[0.07]"
                    >
                      {copied ? <Check size={17} /> : <Link2 size={17} />}
                      {copied ? "Tautan disalin" : "Salin tautan"}
                    </button>
                    {!isOwner && currentUserId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          setReportOpen(true);
                        }}
                        className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-[var(--color-like)] transition-colors active:bg-white/[0.07]"
                      >
                        <Flag size={17} />
                        Laporkan
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={handleTogglePin}
                        className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-white transition-colors active:bg-white/[0.07]"
                      >
                        {pinned ? <PinOff size={17} /> : <Pin size={17} />}
                        {pinned ? "Lepas sematan" : "Sematkan di profil"}
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={handleEditClick}
                        className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-white transition-colors active:bg-white/[0.07]"
                      >
                        <Pencil size={17} />
                        Edit
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={handleDelete}
                        disabled={isPending}
                        className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-[var(--color-like)] transition-colors active:bg-white/[0.07]"
                      >
                        <Trash2 size={17} />
                        Hapus
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div onClick={(e) => e.stopPropagation()} className="mt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                className="w-full resize-none rounded-[var(--radius-sm)] border border-white/15 bg-[var(--color-surface-2)] p-3 text-[15.5px] leading-[1.5] text-white focus:border-white/40 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-end gap-2.5">
                <button
                  onClick={handleCancelEdit}
                  className="rounded-full px-4 py-1.5 text-[13.5px] font-bold text-[var(--color-text-dim)] transition-colors active:bg-white/[0.07] active:text-white"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending || !editContent.trim()}
                  className="rounded-full bg-white px-4 py-1.5 text-[13.5px] font-bold text-black transition-all active:scale-[0.94] disabled:opacity-30"
                >
                  {isPending ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </div>
          ) : (
            <PostText content={displayContent} />
          )}

          {post.image_url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className={`block w-full overflow-hidden rounded-[var(--radius-md)] border border-white/10 ${post.content.trim() ? "mt-3" : "mt-1.5"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.image_url}
                alt=""
                loading="lazy"
                className="max-h-[480px] w-full object-cover"
                style={
                  post.image_width && post.image_height
                    ? { aspectRatio: `${post.image_width} / ${post.image_height}` }
                    : undefined
                }
              />
            </button>
          )}

          {post.video_url && (
            <VideoPlayer
              src={post.video_url}
              posterUrl={post.video_thumbnail_url}
              width={post.video_width}
              height={post.video_height}
              durationSec={post.video_duration_sec}
            />
          )}

          {post.quote_post_id && (
            <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-white/10">
              {post.quoted_post?.deleted ? (
                <p className="px-3.5 py-3 text-[13.5px] text-[var(--color-text-faint)]">Utas ini sudah dihapus.</p>
              ) : post.quoted_post ? (
                <Link
                  href={`/utas/${post.quoted_post.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block px-3.5 py-3 transition-colors active:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      username={post.quoted_post.author.username}
                      displayName={post.quoted_post.author.display_name}
                      avatarUrl={post.quoted_post.author.avatar_url}
                      size="sm"
                    />
                    <span className="text-[13.5px] font-bold text-white">{post.quoted_post.author.username}</span>
                  </div>
                  {post.quoted_post.content && (
                    <p className="mt-1.5 line-clamp-3 text-[14px] leading-snug text-[var(--color-text-dim)]">
                      {post.quoted_post.content}
                    </p>
                  )}
                  {post.quoted_post.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.quoted_post.image_url} alt="" className="mt-2 max-h-52 w-full rounded-[var(--radius-sm)] object-cover" />
                  )}
                </Link>
              ) : null}
            </div>
          )}

          {post.poll && <PollView poll={post.poll} currentUserId={currentUserId} />}

          {/* Action row: satu baris menyatu, bookmark ikut di dalamnya (bukan terpisah) */}
          <div className="-ml-2 mt-2 flex items-center">
            <button onClick={handleLike} disabled={isPending} aria-label={liked ? "Batal suka" : "Suka"} aria-pressed={liked} className={`${actionBtn} w-11 active:bg-[var(--color-surface-3)]`}>
              <Heart
                size={21}
                strokeWidth={2}
                fill={liked ? "var(--color-like)" : "none"}
                className={`${liked ? "text-[var(--color-like)]" : ""} ${likePopping ? "animate-heart-pop" : ""}`}
              />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                announceRouteTransition(`/utas/${post.id}`);
                router.push(`/utas/${post.id}`);
              }}
              aria-label="Balas"
              className={`${actionBtn} w-11 active:bg-[var(--color-surface-3)] active:text-white`}
            >
              <MessageCircle size={21} strokeWidth={2} />
            </button>
            <button
              onClick={handleRepostClick}
              disabled={isPending || !currentUserId}
              aria-label="Ulang unggah"
              className={`${actionBtn} w-11 active:bg-[var(--color-surface-3)] active:text-white`}
            >
              <Repeat2 size={21} strokeWidth={2} />
            </button>
            <button
              onClick={handleBookmark}
              disabled={isPending || !currentUserId}
              aria-label={bookmarked ? "Batal simpan" : "Simpan"}
              aria-pressed={bookmarked}
              className={`${actionBtn} w-11 active:bg-[var(--color-surface-3)] ${bookmarked ? "text-white" : ""}`}
            >
              <Bookmark size={19} strokeWidth={2} fill={bookmarked ? "white" : "none"} />
            </button>
          </div>

          {(likeCount > 0 || post.reply_count > 0 || (!clickable && post.view_count > 0)) && (
            <p className="text-[13.5px] font-medium tabular-nums text-[var(--color-text-faint)]">
              {post.reply_count > 0 && `${post.reply_count} balasan`}
              {post.reply_count > 0 && likeCount > 0 && "  ·  "}
              {likeCount > 0 && (
                <Link href={`/utas/${post.id}/suka`} onClick={(e) => e.stopPropagation()} className="active:text-white">
                  {likeCount} suka
                </Link>
              )}
              {!clickable && post.view_count > 0 && (
                <>
                  {(likeCount > 0 || post.reply_count > 0) && "  ·  "}
                  {post.view_count.toLocaleString("id-ID")} dilihat
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirmOpen}
          title="Hapus utas ini?"
          description="Utas yang dihapus tidak dapat dikembalikan. Balasan pada utas ini juga akan ikut terhapus."
          confirmLabel="Hapus"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setConfirmOpen(false)}
        />
        {currentUserId && effectiveProfile && (
          <QuoteComposer
            open={quoteOpen}
            post={post}
            authorUsername={effectiveProfile.username}
            authorDisplayName={effectiveProfile.display_name}
            authorAvatarUrl={effectiveProfile.avatar_url}
            onClose={() => setQuoteOpen(false)}
            onSuccess={() => {
              setQuoteOpen(false);
              showToast("Berhasil diulang unggah");
            }}
          />
        )}
      </div>

      {lightboxOpen && post.image_url && (
        <div onClick={(e) => e.stopPropagation()}>
          <ImageLightbox src={post.image_url} onClose={() => setLightboxOpen(false)} />
        </div>
      )}

      {reportOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <ReportDialog open={reportOpen} target={{ type: "post", id: post.id }} onClose={() => setReportOpen(false)} />
        </div>
      )}
    </article>
  );
}
