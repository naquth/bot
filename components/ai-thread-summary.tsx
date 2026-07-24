"use client";

import { useState, useTransition } from "react";
import { Sparkles, RotateCw } from "lucide-react";
import { summarizeThread } from "@/app/ai-actions";

export function AiThreadSummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await summarizeThread(postId);
      if (res.ok) {
        setSummary(res.data);
      } else {
        setSummary(null);
        setError(res.error);
      }
    });
  }

  return (
    <div className="border-b border-[var(--color-border)] px-4 py-3">
      {!summary && (
        <button
          onClick={generate}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-[13px] font-semibold text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] disabled:opacity-50"
        >
          {isPending ? (
            <RotateCw size={14} className="animate-spin" strokeWidth={2.25} />
          ) : (
            <Sparkles size={14} strokeWidth={2.25} />
          )}
          {isPending ? "Meringkas balasan…" : "Ringkas balasan dengan AI"}
        </button>
      )}

      {error && <p className="mt-2 text-[13px] text-[var(--color-like)]">{error}</p>}

      {summary && (
        <div className="animate-slide-down rounded-[var(--radius-md)] border border-white/15 bg-[var(--color-surface-2)] p-3.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-text-dim)]">
            <Sparkles size={13} strokeWidth={2.25} />
            Ringkasan AI
          </div>
          <p className="mt-1.5 text-[14px] leading-[1.5] text-white">{summary}</p>
        </div>
      )}
    </div>
  );
}
