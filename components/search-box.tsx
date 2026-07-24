"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Search, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { searchPostsAction } from "@/app/actions";
import type { Profile, Post } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { PostCard } from "@/components/post-card";

type Tab = "akun" | "utas";

export function SearchBox({ currentUserId, trendingPosts }: { currentUserId?: string; trendingPosts: Post[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("akun");
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const timeout = setTimeout(() => {
      startTransition(async () => {
        const supabase = createClient();
        const [{ data: users }, posts] = await Promise.all([
          supabase.from("profiles").select("*").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(20),
          searchPostsAction(q),
        ]);
        setUserResults(users ?? []);
        setPostResults(posts);
        setSearched(true);
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = query.trim();
  const showUsers = trimmedQuery ? userResults : [];
  const showPosts = trimmedQuery ? postResults : [];
  const activeCount = tab === "akun" ? showUsers.length : showPosts.length;
  const showEmpty = trimmedQuery ? searched && activeCount === 0 : false;

  return (
    <div>
      <div className="px-4 py-3.5">
        <label htmlFor="search-input" className="sr-only">
          Cari nama, nama pengguna, atau isi utas
        </label>
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
          <Search size={18} strokeWidth={2} className="text-[var(--color-text-faint)]" />
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, nama pengguna, atau isi utas"
            className="w-full bg-transparent text-[15px] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      {!trimmedQuery && (
        <>
          <div className="border-b border-[var(--color-border)] px-4 pb-3">
            <span className="text-[14.5px] font-bold text-white">Jelajahi</span>
          </div>
          {trendingPosts.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14.5px] text-[var(--color-text-dim)]">
              Belum ada utas populer minggu ini.
            </p>
          ) : (
            trendingPosts.map((post) => <PostCard key={post.id} post={post} currentUserId={currentUserId} />)
          )}
        </>
      )}

      {trimmedQuery && (
        <div className="flex border-b border-[var(--color-border)] px-4">
          {(["akun", "utas"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-3 text-[14.5px] font-bold transition-colors ${
                tab === t ? "text-white" : "text-[var(--color-text-faint)]"
              }`}
            >
              {t === "akun" ? "Akun" : "Utas"}
              {tab === t && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-white" />}
            </button>
          ))}
        </div>
      )}

      {isPending && trimmedQuery && (
        <p className="px-4 py-6 text-center text-[14px] text-[var(--color-text-faint)]">Mencari…</p>
      )}

      {!isPending && showEmpty && (
        <p className="px-4 py-8 text-center text-[14.5px] text-[var(--color-text-dim)]">
          Tidak ada hasil untuk &ldquo;{query}&rdquo;
        </p>
      )}

      {!isPending && tab === "akun" &&
        showUsers.map((profile) => (
          <Link
            key={profile.id}
            href={`/profil/${profile.username}`}
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5 transition-colors active:bg-white/[0.03]"
          >
            <Avatar username={profile.username} displayName={profile.display_name} avatarUrl={profile.avatar_url} size="list" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-[15px] font-bold text-white">
                {profile.display_name}
                {profile.is_private && (
                  <Lock size={12.5} strokeWidth={2.5} className="shrink-0 text-[var(--color-text-faint)]" />
                )}
              </p>
              <p className="truncate text-[14px] text-[var(--color-text-dim)]">@{profile.username}</p>
            </div>
          </Link>
        ))}

      {!isPending && tab === "utas" &&
        showPosts.map((post) => <PostCard key={post.id} post={post} currentUserId={currentUserId} />)}
    </div>
  );
}
