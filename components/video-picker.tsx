"use client";

import { useRef, useState } from "react";
import { Video as VideoIcon, X } from "lucide-react";
import { validateVideoFile, processVideo } from "@/lib/process-video";
import { createClient } from "@/lib/supabase/client";

export type PickedVideo = {
  previewUrl: string;
  storageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSec: number;
};

export function VideoPicker({
  userId,
  video,
  onChange,
  onError,
}: {
  userId: string;
  video: PickedVideo | null;
  onChange: (video: PickedVideo | null) => void;
  onError: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateVideoFile(file);
    if (validationError) {
      onError(validationError);
      return;
    }

    setUploading(true);
    setProgress("Memproses video…");
    try {
      const processed = await processVideo(file);
      const previewUrl = URL.createObjectURL(file);

      const supabase = createClient();
      const timestamp = Date.now();
      const videoPath = `${userId}/${timestamp}.mp4`;
      const thumbPath = `${userId}/${timestamp}-thumb.jpg`;

      setProgress("Mengunggah video…");
      const { error: videoError } = await supabase.storage
        .from("post-videos")
        .upload(videoPath, processed.file, { contentType: file.type });

      if (videoError) {
        onError("Gagal mengunggah video.");
        setUploading(false);
        setProgress(null);
        return;
      }

      setProgress("Mengunggah thumbnail…");
      const { error: thumbError } = await supabase.storage
        .from("post-images")
        .upload(thumbPath, processed.thumbnailBlob, { contentType: "image/jpeg" });

      if (thumbError) {
        onError("Gagal mengunggah thumbnail.");
        setUploading(false);
        setProgress(null);
        return;
      }

      const { data: videoUrlData } = supabase.storage.from("post-videos").getPublicUrl(videoPath);
      const { data: thumbUrlData } = supabase.storage.from("post-images").getPublicUrl(thumbPath);

      onChange({
        previewUrl,
        storageUrl: videoUrlData.publicUrl,
        thumbnailUrl: thumbUrlData.publicUrl,
        width: processed.width,
        height: processed.height,
        durationSec: processed.durationSec,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal memproses video.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  if (video) {
    return (
      <div className="relative mt-3 overflow-hidden rounded-[var(--radius-md)] border border-white/10">
        <video
          src={video.previewUrl}
          controls
          playsInline
          className="max-h-[420px] w-full object-cover"
          style={{ aspectRatio: `${video.width} / ${video.height}` }}
        />
        <button
          onClick={() => onChange(null)}
          aria-label="Hapus video"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-transform active:scale-90"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="Lampirkan video"
        className="mt-2 flex h-9 items-center gap-2 rounded-full px-2 text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] active:text-white disabled:opacity-50"
      >
        {uploading ? (
          <>
            <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <span className="text-[13px] font-medium">{progress}</span>
          </>
        ) : (
          <VideoIcon size={20} strokeWidth={2} />
        )}
      </button>
      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleFileChange} className="hidden" />
    </>
  );
}
