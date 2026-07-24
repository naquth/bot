"use client";

import { useState, useTransition } from "react";
import { createPost } from "@/app/actions";

import { MAX_POST_LEN as MAX_LEN } from "@/lib/constants";
import { Avatar } from "@/components/avatar";
import { ImagePicker, type PickedImage } from "@/components/image-picker";

type ReplyComposerProps = {
  parentId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  onReplied?: (newPostId: string) => void;
};

export function ReplyComposer({
  parentId,
  authorId,
  authorUsername,
  authorDisplayName,
  authorAvatarUrl,
  onReplied,
}: ReplyComposerProps) {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const overLimit = content.length > MAX_LEN;
  const nearLimit = content.length > MAX_LEN * 0.85;
  const pct = Math.min(content.length / MAX_LEN, 1);
  const circumference = 2 * Math.PI * 9;
  const dashoffset = circumference * (1 - pct);
  const canSubmit = (content.trim().length > 0 || image !== null) && !overLimit && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createPost(content.trim(), {
        parentId,
        image: image ? { url: image.storageUrl, width: image.width, height: image.height } : undefined,
      });
      if (res.ok && res.id) {
        setContent("");
        setImage(null);
        onReplied?.(res.id);
      } else if (!res.ok) {
        setError(res.error ?? "Gagal mengirim.");
      }
    });
  }

  return (
    <div className="border-b border-[var(--color-border)] px-4 py-4">
      <div className="flex gap-3">
        <Avatar username={authorUsername} displayName={authorDisplayName} avatarUrl={authorAvatarUrl} />
        <div className="min-w-0 flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Balas utas ini…"
            rows={2}
            className="w-full resize-none bg-transparent text-[15px] leading-[1.5] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />

          <ImagePicker userId={authorId} image={image} onChange={setImage} onError={setError} />

          {error && <p className="mt-2 text-[13.5px] text-[var(--color-like)]">{error}</p>}

          <div className="mt-2.5 flex items-center justify-end gap-3">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="9" fill="none" stroke="var(--color-border)" strokeWidth="2" />
              <circle
                cx="11"
                cy="11"
                r="9"
                fill="none"
                stroke={overLimit ? "var(--color-like)" : "white"}
                strokeWidth="2"
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
                transform="rotate(-90 11 11)"
                style={{ transition: "stroke-dashoffset 0.15s var(--ease-out)" }}
              />
            </svg>
            {nearLimit && (
              <span className={`text-[12.5px] tabular-nums ${overLimit ? "text-[var(--color-like)]" : "text-[var(--color-text-dim)]"}`}>
                {MAX_LEN - content.length}
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-full bg-white px-5 py-2 text-[14px] font-bold text-black transition-all active:scale-[0.94] disabled:opacity-30"
            >
              {isPending ? "Mengirim…" : "Balas"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
