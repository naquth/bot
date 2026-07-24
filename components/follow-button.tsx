"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFollow } from "@/app/actions";

export function FollowButton({
  targetUserId,
  initiallyFollowing,
  isLoggedIn,
}: {
  targetUserId: string;
  initiallyFollowing: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [hovering, setHovering] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/masuk");
      return;
    }
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const ok = await toggleFollow(targetUserId, next);
      if (!ok) setFollowing(!next);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={isPending}
      className={
        following
          ? "w-full min-w-[120px] rounded-full border border-white/[0.14] px-5 py-2.5 text-[14.5px] font-bold text-white transition-colors active:border-[var(--color-like)]/40 active:bg-[var(--color-like)]/10 active:text-[var(--color-like)] disabled:opacity-60"
          : "w-full min-w-[120px] rounded-full bg-white px-5 py-2.5 text-[14.5px] font-bold text-black transition-opacity active:opacity-80 disabled:opacity-60"
      }
    >
      {following ? (hovering ? "Berhenti ikuti" : "Mengikuti") : "Ikuti"}
    </button>
  );
}
