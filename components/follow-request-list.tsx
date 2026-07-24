"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { respondFollowRequest } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { VerifiedBadge } from "@/components/verified-badge";

type RequestItem = {
  requester_id: string;
  created_at: string;
  requester: { username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
};

export function FollowRequestList({ initialRequests }: { initialRequests: RequestItem[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRespond(requesterId: string, accept: boolean) {
    setPendingId(requesterId);
    startTransition(async () => {
      const ok = await respondFollowRequest(requesterId, accept);
      if (ok) {
        setRequests((prev) => prev.filter((r) => r.requester_id !== requesterId));
      }
      setPendingId(null);
    });
  }

  if (requests.length === 0) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-[14.5px] text-[var(--color-text-dim)]">Tidak ada permintaan ikuti tertunda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {requests.map((req) => (
        <div
          key={req.requester_id}
          className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5"
        >
          <Link href={`/profil/${req.requester.username}`} className="shrink-0">
            <Avatar
              username={req.requester.username}
              displayName={req.requester.display_name}
              avatarUrl={req.requester.avatar_url}
              size="md"
            />
          </Link>

          <Link href={`/profil/${req.requester.username}`} className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[14.5px] font-bold text-white">
              {req.requester.display_name}
              {req.requester.is_verified && <VerifiedBadge size={13} />}
            </p>
            <p className="truncate text-[13.5px] text-[var(--color-text-dim)]">
              @{req.requester.username} · <RelativeTime dateStr={req.created_at} />
            </p>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => handleRespond(req.requester_id, false)}
              disabled={isPending && pendingId === req.requester_id}
              aria-label="Tolak"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] text-white transition-colors active:bg-white/[0.07] disabled:opacity-50"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => handleRespond(req.requester_id, true)}
              disabled={isPending && pendingId === req.requester_id}
              aria-label="Terima"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-opacity active:opacity-80 disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
