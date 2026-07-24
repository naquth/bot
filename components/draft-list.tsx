"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Video, BarChart3, Trash2 } from "lucide-react";
import { deleteDraft } from "@/app/actions";
import { RelativeTime } from "@/components/relative-time";
import type { PostDraft } from "@/lib/types";

export function DraftList({ drafts }: { drafts: PostDraft[] }) {
  const router = useRouter();
  const [items, setItems] = useState(drafts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteDraft(id);
      if (res.ok) {
        setItems((prev) => prev.filter((d) => d.id !== id));
      }
      setPendingId(null);
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {items.map((draft) => {
        const preview = draft.content.trim() || "(Tanpa teks)";
        return (
          <li
            key={draft.id}
            className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-[var(--color-surface-2)]"
          >
            <button
              onClick={() => router.push(`/tulis?draft=${draft.id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
                <RelativeTime dateStr={draft.updated_at} />
                {draft.image_url && (
                  <span className="flex items-center gap-1">
                    <ImageIcon size={12} strokeWidth={2} /> Foto
                  </span>
                )}
                {draft.video_url && (
                  <span className="flex items-center gap-1">
                    <Video size={12} strokeWidth={2} /> Video
                  </span>
                )}
                {draft.poll_options && (
                  <span className="flex items-center gap-1">
                    <BarChart3 size={12} strokeWidth={2} /> Poll
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[15px] leading-snug text-white">{preview}</p>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(draft.id);
              }}
              disabled={isPending && pendingId === draft.id}
              aria-label="Hapus draft"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-faint)] transition-colors active:bg-[var(--color-surface-3)] active:text-[var(--color-like)] disabled:opacity-40"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
