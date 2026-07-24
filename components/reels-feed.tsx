"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getVideoFeedBeforeAction } from "@/app/actions";
import { ReelCard } from "@/components/reel-card";
import type { Post } from "@/lib/types";

export function ReelsFeed({ initialPosts, currentUserId }: { initialPosts: Post[]; currentUserId?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const postsRef = useRef(initialPosts);
  const loadingRef = useRef(false);
  const doneRef = useRef(initialPosts.length < 20);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    const cursor = postsRef.current[postsRef.current.length - 1]?.created_at;
    if (!cursor) return;

    loadingRef.current = true;
    const more = await getVideoFeedBeforeAction(cursor);
    setPosts((prev) => [...prev, ...more]);
    if (more.length < 10) doneRef.current = true;
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = itemRefs.current.findIndex((el) => el === entry.target);
            if (idx !== -1) {
              setActiveIndex(idx);
              if (idx >= itemRefs.current.length - 3) loadMore();
            }
          }
        });
      },
      { root: container, threshold: 0.6 }
    );

    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [posts.length, loadMore]);

  if (posts.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="font-display text-[18px] font-bold text-white">Belum ada video</p>
          <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">
            Video yang diunggah orang lain akan muncul di sini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen snap-y snap-mandatory overflow-y-scroll bg-black"
      style={{ scrollbarWidth: "none" }}
    >
      {posts.map((post, i) => (
        <div
          key={post.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className="h-screen w-full snap-start snap-always"
        >
          <ReelCard post={post} currentUserId={currentUserId} isActive={i === activeIndex} />
        </div>
      ))}
    </div>
  );
}
