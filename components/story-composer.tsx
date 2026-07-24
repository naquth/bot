"use client";

import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { StoryMediaPicker, type PickedStoryMedia } from "@/components/story-media-picker";
import { createStory } from "@/app/actions";
import { useToast } from "@/components/toast";

export function StoryComposer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [media, setMedia] = useState<PickedStoryMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handlePost() {
    if (!media) return;
    setPosting(true);
    const result = await createStory({
      image:
        media.kind === "image"
          ? { url: media.storageUrl, width: media.width, height: media.height }
          : undefined,
      video:
        media.kind === "video"
          ? { url: media.storageUrl, width: media.width, height: media.height, durationSec: media.durationSec }
          : undefined,
      caption,
    });

    if (result.ok) {
      showToast("Story dibagikan.");
      onClose();
    } else {
      showToast(result.error, "error");
      setPosting(false);
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors active:bg-white/10"
        >
          <X size={22} strokeWidth={2.25} />
        </button>
        <h2 className="font-display text-[16px] font-bold text-white">Story baru</h2>
        <div className="w-10" />
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {!media ? (
          <StoryMediaPicker userId={userId} onPicked={setMedia} onError={(m) => showToast(m, "error")} />
        ) : media.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video src={media.previewUrl} autoPlay loop muted playsInline className="max-h-full max-w-full object-contain" />
        )}
      </div>

      {media && (
        <div className="shrink-0 border-t border-white/10 bg-black px-4 pb-6 pt-3">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 200))}
            placeholder="Tambahkan keterangan…"
            className="w-full rounded-[var(--radius-full)] bg-white/10 px-4 py-3 text-[14.5px] text-white placeholder:text-white/50 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[12px] text-white/40">{caption.length}/200</span>
            <button
              onClick={handlePost}
              disabled={posting}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-black transition-opacity active:opacity-80 disabled:opacity-50"
            >
              {posting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              ) : (
                <>
                  Bagikan <Send size={15} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
