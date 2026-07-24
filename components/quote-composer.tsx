"use client";

import { useState, useTransition } from "react";
import { createPost } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { MAX_POST_LEN } from "@/lib/constants";
import type { Post } from "@/lib/types";

export function QuoteComposer({
  open,
  post,
  authorUsername,
  authorDisplayName,
  authorAvatarUrl,
  onClose,
  onSuccess,
}: {
  open: boolean;
  post: Post;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const overLimit = content.length > MAX_POST_LEN;

  function handleSubmit() {
    if (overLimit || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await createPost(content.trim(), { quotePostId: post.id });
      if (res.ok) {
        setContent("");
        onSuccess();
      } else {
        setError(res.error ?? "Gagal mengulang unggah.");
      }
    });
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-[480px] rounded-t-[28px] border border-white/10 bg-[#0A0A0B] p-5 sm:rounded-[28px]"
      >
        <div className="flex gap-3">
          <Avatar username={authorUsername} displayName={authorDisplayName} avatarUrl={authorAvatarUrl} />
          <div className="min-w-0 flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tambahkan komentar…"
              rows={3}
              autoFocus
              className="w-full resize-none bg-transparent text-[15.5px] leading-[1.5] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
            />

            <div className="mt-2 rounded-[var(--radius-md)] border border-white/10 p-3">
              <div className="flex items-center gap-2">
                <Avatar username={post.author.username} displayName={post.author.display_name} avatarUrl={post.author.avatar_url} size="sm" />
                <span className="text-[13.5px] font-bold text-white">{post.author.username}</span>
              </div>
              {post.content && (
                <p className="mt-1.5 line-clamp-3 text-[14px] leading-snug text-[var(--color-text-dim)]">{post.content}</p>
              )}
              {post.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.image_url} alt="" className="mt-2 max-h-40 w-full rounded-[var(--radius-sm)] object-cover" />
              )}
            </div>

            {error && <p className="mt-2 text-[13.5px] text-[var(--color-like)]">{error}</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-[14px] font-bold text-[var(--color-text-dim)] transition-colors active:bg-white/[0.07] active:text-white"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={overLimit || isPending}
            className="rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-black transition-all active:scale-[0.96] disabled:opacity-30"
          >
            {isPending ? "Mengirim…" : "Ulang unggah"}
          </button>
        </div>
      </div>
    </div>
  );
}
