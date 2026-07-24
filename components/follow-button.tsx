"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendFollowRequest, cancelFollowRequest, toggleFollow } from "@/app/actions";
import type { FollowStatus } from "@/lib/types";

export function FollowButton({
  targetUserId,
  initialStatus,
  isLoggedIn,
}: {
  targetUserId: string;
  initialStatus: FollowStatus;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const [hovering, setHovering] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/masuk");
      return;
    }

    if (status === "none") {
      const prev = status;
      setStatus("requested"); // optimis; RPC akan mengoreksi ke "following" kalau akun publik
      startTransition(async () => {
        const result = await sendFollowRequest(targetUserId);
        if (!result) {
          setStatus(prev);
        } else {
          setStatus(result);
        }
        router.refresh();
      });
      return;
    }

    if (status === "requested") {
      setStatus("none");
      startTransition(async () => {
        const ok = await cancelFollowRequest(targetUserId);
        if (!ok) setStatus("requested");
        router.refresh();
      });
      return;
    }

    // status === "following" -> unfollow
    setStatus("none");
    startTransition(async () => {
      const ok = await toggleFollow(targetUserId, false);
      if (!ok) setStatus("following");
      router.refresh();
    });
  }

  const isFollowing = status === "following";
  const isRequested = status === "requested";

  let label = "Ikuti";
  if (isFollowing) label = hovering ? "Berhenti ikuti" : "Mengikuti";
  else if (isRequested) label = hovering ? "Batalkan" : "Diminta";

  const outlined = isFollowing || isRequested;

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={isPending}
      className={
        outlined
          ? "w-full min-w-[120px] rounded-full border border-white/[0.14] px-5 py-2.5 text-[14.5px] font-bold text-white transition-colors active:border-[var(--color-like)]/40 active:bg-[var(--color-like)]/10 active:text-[var(--color-like)] disabled:opacity-60"
          : "w-full min-w-[120px] rounded-full bg-white px-5 py-2.5 text-[14.5px] font-bold text-black transition-opacity active:opacity-80 disabled:opacity-60"
      }
    >
      {label}
    </button>
  );
}
