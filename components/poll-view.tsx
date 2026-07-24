"use client";

import { useState, useTransition, useEffect } from "react";
import { votePoll } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { Poll } from "@/lib/types";

function timeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Selesai";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / 60000)}m lagi`;
  if (hours < 24) return `${hours}j lagi`;
  return `${Math.floor(hours / 24)}h lagi`;
}

export function PollView({ poll, currentUserId }: { poll: Poll; currentUserId?: string }) {
  const [data, setData] = useState(poll);
  const [isPending, startTransition] = useTransition();
  // isClosed dihitung sekali saat komponen pertama kali mount (bukan di setiap
  // render) untuk menghindari pemanggilan Date.now() langsung di render body,
  // yang melanggar aturan purity React. Selisih beberapa detik akibat waktu
  // mount vs waktu sebenarnya bisa diterima untuk kasus poll (bukan sistem
  // real-time kritis).
  const [isClosed] = useState(() => new Date(poll.closes_at).getTime() <= Date.now());
  const hasVoted = data.my_vote_option_id !== null;
  const showResults = hasVoted || isClosed;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`poll:${poll.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "poll_votes", filter: `poll_id=eq.${poll.id}` },
        (payload) => {
          const vote = payload.new as { option_id: string; voter_id: string };
          setData((prev) => ({
            ...prev,
            total_votes: prev.total_votes + 1,
            options: prev.options.map((o) => (o.id === vote.option_id ? { ...o, vote_count: o.vote_count + 1 } : o)),
            my_vote_option_id: vote.voter_id === currentUserId ? vote.option_id : prev.my_vote_option_id,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll.id, currentUserId]);

  function handleVote(optionId: string) {
    if (hasVoted || isClosed || !currentUserId || isPending) return;
    setData((prev) => ({
      ...prev,
      my_vote_option_id: optionId,
      total_votes: prev.total_votes + 1,
      options: prev.options.map((o) => (o.id === optionId ? { ...o, vote_count: o.vote_count + 1 } : o)),
    }));
    startTransition(async () => {
      const res = await votePoll(poll.id, optionId);
      if (!res.ok) {
        setData(poll);
      }
    });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-3 flex flex-col gap-2">
      {data.options.map((option) => {
        const pct = data.total_votes > 0 ? Math.round((option.vote_count / data.total_votes) * 100) : 0;
        const isMyVote = data.my_vote_option_id === option.id;

        if (!showResults) {
          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={!currentUserId}
              className="w-full rounded-[var(--radius-sm)] border border-white/20 px-4 py-3 text-left text-[14.5px] font-semibold text-white transition-colors active:bg-white/[0.06] disabled:opacity-50"
            >
              {option.label}
            </button>
          );
        }

        return (
          <button
            key={option.id}
            onClick={() => handleVote(option.id)}
            disabled
            className="relative w-full overflow-hidden rounded-[var(--radius-sm)] border border-white/10 px-4 py-3 text-left"
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/[0.12] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between">
              <span className={`text-[14.5px] ${isMyVote ? "font-bold text-white" : "font-medium text-[var(--color-text-dim)]"}`}>
                {option.label}
                {isMyVote && " ✓"}
              </span>
              <span className="text-[13.5px] font-bold tabular-nums text-white">{pct}%</span>
            </div>
          </button>
        );
      })}

      <p className="mt-0.5 text-[13px] text-[var(--color-text-faint)]">
        {data.total_votes} suara · {timeLeft(data.closes_at)}
      </p>
    </div>
  );
}
