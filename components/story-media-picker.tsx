"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { resizePostImage } from "@/lib/resize-image";
import { validateVideoFile, processVideo } from "@/lib/process-video";
import { createClient } from "@/lib/supabase/client";

export type PickedStoryMedia =
  | { kind: "image"; previewUrl: string; storageUrl: string; width: number; height: number }
  | {
      kind: "video";
      previewUrl: string;
      storageUrl: string;
      width: number;
      height: number;
      durationSec: number;
    };

export function StoryMediaPicker({
  userId,
  onPicked,
  onError,
  disabled,
}: {
  userId: string;
  onPicked: (media: PickedStoryMedia) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      onError("File harus berupa gambar.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onError("Ukuran gambar maksimal 8MB.");
      return;
    }

    setBusy("Mengunggah story…");
    try {
      const resized = await resizePostImage(file, 1600);
      const previewUrl = URL.createObjectURL(resized.blob);
      const supabase = createClient();
      const path = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("stories")
        .upload(path, resized.blob, { contentType: "image/jpeg" });

      if (error) {
        onError("Gagal mengunggah gambar.");
        return;
      }

      const { data } = supabase.storage.from("stories").getPublicUrl(path);
      onPicked({
        kind: "image",
        previewUrl,
        storageUrl: data.publicUrl,
        width: resized.width,
        height: resized.height,
      });
    } catch {
      onError("Gagal memproses gambar.");
    } finally {
      setBusy(null);
    }
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateVideoFile(file);
    if (validationError) {
      onError(validationError);
      return;
    }

    setBusy("Memproses video…");
    try {
      const processed = await processVideo(file);
      if (processed.durationSec > 60) {
        onError("Video story maksimal 60 detik.");
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const supabase = createClient();
      const path = `${userId}/${Date.now()}.mp4`;

      setBusy("Mengunggah video…");
      const { error } = await supabase.storage
        .from("stories")
        .upload(path, processed.file, { contentType: file.type });

      if (error) {
        onError("Gagal mengunggah video.");
        return;
      }

      const { data } = supabase.storage.from("stories").getPublicUrl(path);
      onPicked({
        kind: "video",
        previewUrl,
        storageUrl: data.publicUrl,
        width: processed.width,
        height: processed.height,
        durationSec: processed.durationSec,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal memproses video.");
    } finally {
      setBusy(null);
    }
  }

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="text-[14px] font-medium text-white/80">{busy}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={disabled}
        onClick={() => imageInputRef.current?.click()}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] px-6 py-5 transition-colors active:bg-white/10 disabled:opacity-50"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <ImageIcon size={24} strokeWidth={2} className="text-white" />
        </div>
        <span className="text-[13px] font-semibold text-white">Foto</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => videoInputRef.current?.click()}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] px-6 py-5 transition-colors active:bg-white/10 disabled:opacity-50"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <VideoIcon size={24} strokeWidth={2} className="text-white" />
        </div>
        <span className="text-[13px] font-semibold text-white">Video</span>
      </button>
      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleVideo}
        className="hidden"
      />
    </div>
  );
}
