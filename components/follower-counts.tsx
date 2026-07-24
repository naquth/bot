"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function FollowerCounts({
  profileId,
  initialFollowerCount,
  initialFollowingCount,
}: {
  profileId: string;
  initialFollowerCount: number;
  initialFollowingCount: number;
}) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [followingCount, setFollowingCount] = useState(initialFollowingCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`follows:${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "follows", filter: `following_id=eq.${profileId}` },
        () => setFollowerCount((c) => c + 1)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "follows", filter: `following_id=eq.${profileId}` },
        () => setFollowerCount((c) => Math.max(0, c - 1))
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "follows", filter: `follower_id=eq.${profileId}` },
        () => setFollowingCount((c) => c + 1)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "follows", filter: `follower_id=eq.${profileId}` },
        () => setFollowingCount((c) => Math.max(0, c - 1))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  return (
    <p className="mt-3 text-[14.5px] text-[var(--color-text-dim)]">
      <span className="font-medium text-white">{followerCount}</span> pengikut
      <span className="mx-1.5">·</span>
      <span className="font-medium text-white">{followingCount}</span> mengikuti
    </p>
  );
}
