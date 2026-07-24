"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { RelativeTime } from "@/components/relative-time";
import { recordStoryView, deleteStory, getStoryViewers } from "@/app/actions";
import { useToast } from "@/components/toast";
import type { StoryGroup } from "@/lib/types";

const IMAGE_DURATION_MS = 5000;

export function StoryViewer({
  groups,
  initialGroupIndex,
  currentUserId,
  onClose,
}: {
  groups: StoryGroup[];
  initialGroupIndex: number;
  currentUserId?: string;
  onClose: () => void;
}) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<{ created_at: string; viewer: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean } }[]>([]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { showToast } = useToast();

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const isMine = story?.author_id === currentUserId;

  const goNext = useCallback(() => {
    setShowViewers(false);
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((i) => i + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }, [group, storyIndex, groupIndex, groups.length, onClose]);

  const goPrev = useCallback(() => {
    setShowViewers(false);
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex((i) => i - 1);
      setStoryIndex(prevGroup.stories.length - 1);
    }
  }, [storyIndex, groupIndex, groups]);

  // Catat view begitu story tampil
  useEffect(() => {
    if (story) recordStoryView(story.id);
  }, [story]);

  // Progress bar / auto-advance
  useEffect(() => {
    if (!story || paused || showViewers) return;

    const duration =
      story.video_url && story.video_duration_sec ? story.video_duration_sec * 1000 : IMAGE_DURATION_MS;

    startRef.current = Date.now();
    pausedAtRef.current = 0;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, showViewers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, goNext, goPrev]);

  async function handleDelete() {
    if (!story) return;
    if (!window.confirm("Hapus story ini?")) return;
    const result = await deleteStory(story.id);
    if (result.ok) {
      showToast("Story dihapus.");
      goNext();
    } else {
      showToast(result.error, "error");
    }
  }

  async function handleShowViewers() {
    if (!story) return;
    setPaused(true);
    setShowViewers(true);
    const data = await getStoryViewers(story.id);
    setViewers(data);
  }

  if (!group || !story) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-[500px] overflow-hidden">
        {/* Progress bars */}
        <div className="absolute left-2 right-2 top-2 z-20 flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full bg-white"
                style={{
                  width: i < storyIndex ? "100%" : i === storyIndex ? `${progress}%` : "0%",
                  transition: i === storyIndex ? "none" : "width 0.15s linear",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute left-0 right-0 top-6 z-20 flex items-center justify-between px-3">
          <Link href={`/profil/${group.author.username}`} className="flex items-center gap-2.5">
            <Avatar
              username={group.author.username}
              displayName={group.author.display_name}
              avatarUrl={group.author.avatar_url}
              size="sm"
            />
            <span className="flex items-center gap-1 text-[14px] font-bold text-white">
              {group.author.display_name}
              {group.author.is_verified && <VerifiedBadge size={13} />}
            </span>
            <span className="text-[13px] text-white/60"><RelativeTime dateStr={story.created_at} /></span>
          </Link>
          <div className="flex items-center gap-1">
            {isMine && (
              <button
                onClick={handleDelete}
                aria-label="Hapus story"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors active:bg-white/10"
              >
                <Trash2 size={18} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors active:bg-white/10"
            >
              <X size={20} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Media */}
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundColor: story.bg_color || "#000000" }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
            setPaused(true);
          }}
          onPointerUp={(e) => {
            setPaused(false);
            if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
            const x = e.clientX;
            const width = e.currentTarget.clientWidth;
            if (x < width / 3) goPrev();
            else if (x > (width * 2) / 3) goNext();
          }}
        >
          {story.video_url ? (
            <video
              ref={videoRef}
              src={story.video_url}
              autoPlay
              playsInline
              muted={false}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.image_url ?? ""} alt="" className="max-h-full max-w-full object-contain" />
          )}
        </div>

        {/* Caption */}
        {story.caption && (
          <div className="absolute bottom-8 left-0 right-0 px-5 text-center">
            <p className="inline-block rounded-[var(--radius-md)] bg-black/50 px-4 py-2 text-[15px] text-white backdrop-blur-sm">
              {story.caption}
            </p>
          </div>
        )}

        {/* View count (own story) */}
        {isMine && (
          <button
            data-no-nav
            onClick={handleShowViewers}
            className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition-opacity active:opacity-70"
          >
            <Eye size={14} strokeWidth={2} />
            {story.view_count} dilihat
          </button>
        )}

        {/* Viewers sheet */}
        {showViewers && (
          <div
            data-no-nav
            className="animate-sheet-up absolute inset-x-0 bottom-0 z-30 max-h-[60%] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-white/10 bg-[#111113] px-4 pb-8 pt-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[15px] font-bold text-white">Dilihat oleh</h3>
              <button
                onClick={() => {
                  setShowViewers(false);
                  setPaused(false);
                }}
                aria-label="Tutup daftar penonton"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors active:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {viewers.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-white/50">Belum ada yang melihat.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {viewers.map((v) => (
                  <li key={v.viewer.id}>
                    <Link href={`/profil/${v.viewer.username}`} className="flex items-center gap-3">
                      <Avatar
                        username={v.viewer.username}
                        displayName={v.viewer.display_name}
                        avatarUrl={v.viewer.avatar_url}
                        size="sm"
                      />
                      <div>
                        <p className="flex items-center gap-1 text-[14px] font-semibold text-white">
                          {v.viewer.display_name}
                          {v.viewer.is_verified && <VerifiedBadge size={12} />}
                        </p>
                        <p className="text-[12.5px] text-white/50">@{v.viewer.username}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
