"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { FeedList } from "@/components/feed-list";
import { Avatar } from "@/components/avatar";
import type { Post } from "@/lib/types";

type Tab = "untukmu" | "mengikuti";

type MyProfile = { username: string; display_name: string; avatar_url: string | null };

export function FeedTabs({
  initialForYouPosts,
  initialFollowingPosts,
  followingFailed,
  currentUserId,
  isLoggedIn,
  myProfile,
  topSlot,
}: {
  initialForYouPosts: Post[];
  initialFollowingPosts: Post[];
  followingFailed: boolean;
  currentUserId?: string;
  isLoggedIn: boolean;
  myProfile: MyProfile | null;
  topSlot?: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("untukmu");

  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-black/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-[52px] items-center justify-between px-3">
          {isLoggedIn && myProfile ? (
            <Link href="/profil" aria-label="Profil">
              <Avatar username={myProfile.username} displayName={myProfile.display_name} avatarUrl={myProfile.avatar_url} size="sm" />
            </Link>
          ) : (
            <Link
              href="/cari"
              aria-label="Cari"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
            >
              <Search size={20} strokeWidth={2} className="text-white" />
            </Link>
          )}

          <Image src="/logo-mark.png" alt="Utas" width={36} height={36} priority className="shrink-0" />

          {isLoggedIn ? (
            <Link
              href="/cari"
              aria-label="Cari"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
            >
              <Search size={20} strokeWidth={2} className="text-white" />
            </Link>
          ) : (
            <Link
              href="/masuk"
              className="rounded-full bg-white px-5 py-2 text-[14px] font-bold text-black transition-opacity active:opacity-80"
            >
              Masuk
            </Link>
          )}
        </div>

        {isLoggedIn && (
          <div className="flex">
            {(["untukmu", "mengikuti"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative flex-1 py-3 text-center text-[14.5px] font-bold transition-colors ${
                  tab === t ? "text-white" : "text-[var(--color-text-faint)]"
                }`}
              >
                {t === "untukmu" ? "Untukmu" : "Mengikuti"}
                {tab === t && <span className="absolute bottom-0 left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-white" />}
              </button>
            ))}
          </div>
        )}
      </header>

      {topSlot}

      {!isLoggedIn ? (
        <FeedList initialPosts={initialForYouPosts} currentUserId={currentUserId} />
      ) : (
        <>
          {tab === "untukmu" && <FeedList initialPosts={initialForYouPosts} currentUserId={currentUserId} />}

          {tab === "mengikuti" &&
            (followingFailed ? (
              <div className="px-4 py-16 text-center">
                <p className="font-display text-[16px] font-bold text-white">Gagal memuat</p>
                <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">Coba muat ulang halaman.</p>
              </div>
            ) : initialFollowingPosts.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="font-display text-[16px] font-bold text-white">Belum ada utas</p>
                <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">
                  Ikuti seseorang untuk melihat utas mereka di sini.
                </p>
              </div>
            ) : (
              <FeedList initialPosts={initialFollowingPosts} currentUserId={currentUserId} />
            ))}
        </>
      )}
    </div>
  );
}
