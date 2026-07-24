"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { MessageSquareText, ArrowUp } from "lucide-react";
import { PostCard } from "@/components/post-card";
import { loadMorePosts, getPostById } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { Post } from "@/lib/types";

export function FeedList({ initialPosts, currentUserId }: { initialPosts: Post[]; currentUserId?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialPosts.length < 30);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef(new Set(initialPosts.map((p) => p.id)));

  const loadMore = useCallback(async () => {
    if (loading || done || posts.length === 0) return;
    setLoading(true);
    const cursor = posts[posts.length - 1].created_at;
    const more = await loadMorePosts(cursor);
    setPosts((prev) => [...prev, ...more]);
    more.forEach((p) => knownIdsRef.current.add(p.id));
    if (more.length < 20) setDone(true);
    setLoading(false);
  }, [loading, done, posts]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Realtime: deteksi post baru dari siapa saja, tampilkan sebagai banner
  // di atas feed alih-alih langsung disisipkan (supaya tidak mengganggu scroll).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("feed:new-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const newPost = payload.new as { id: string; parent_id: string | null; author_id: string };
          if (newPost.parent_id) return; // hanya post utama, bukan reply
          if (knownIdsRef.current.has(newPost.id)) return;
          if (newPost.author_id === currentUserId) return; // post sendiri sudah muncul lewat composer
          knownIdsRef.current.add(newPost.id);
          setPendingIds((prev) => [...prev, newPost.id]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          setPendingIds((prev) => prev.filter((id) => id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  async function handleShowNewPosts() {
    const ids = pendingIds;
    setPendingIds([]);
    const fetched = await Promise.all(ids.map((id) => getPostById(id)));
    const validPosts = fetched.filter((p): p is Post => p !== null);
    setPosts((prev) => [...validPosts.reverse(), ...prev]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePostDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  if (posts.length === 0 && pendingIds.length === 0) {
    return (
      <div className="px-4 py-24 text-center">
        <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--color-surface-2)]">
          <MessageSquareText size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
        </div>
        <p className="mt-5 font-display text-[19px] font-bold tracking-[-0.01em] text-white">
          Belum ada apa-apa di sini
        </p>
        <p className="mt-1.5 text-[15px] text-[var(--color-text-dim)]">
          Jadi yang pertama nulis sesuatu.
        </p>
        {currentUserId && (
          <Link
            href="/tulis"
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-[14.5px] font-bold text-black transition-opacity active:opacity-80"
          >
            Tulis utas pertama
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {pendingIds.length > 0 && (
        <button
          onClick={handleShowNewPosts}
          className="animate-slide-down flex w-full items-center justify-center gap-2 border-b border-[var(--color-border)] bg-white/[0.04] py-3.5 text-[14px] font-bold text-white transition-colors active:bg-white/[0.07]"
        >
          <ArrowUp size={16} strokeWidth={2.5} />
          {pendingIds.length === 1 ? "1 utas baru" : `${pendingIds.length} utas baru`}
        </button>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} currentUserId={currentUserId} onDeleted={handlePostDeleted} />
      ))}
      {!done && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white" />
        </div>
      )}
      {done && posts.length > 5 && (
        <p className="py-10 text-center text-[13.5px] text-[var(--color-text-faint)]">
          Sudah sampai ujung utas.
        </p>
      )}
    </div>
  );
}
