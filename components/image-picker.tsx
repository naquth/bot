"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { resizePostImage } from "@/lib/resize-image";
import { createClient } from "@/lib/supabase/client";

export type PickedImage = {
  previewUrl: string;
  storageUrl: string;
  width: number;
  height: number;
};

export function ImagePicker({
  userId,
  image,
  onChange,
  onError,
}: {
  userId: string;
  image: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  onError: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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

    setUploading(true);
    try {
      const resized = await resizePostImage(file);
      const previewUrl = URL.createObjectURL(resized.blob);

      const supabase = createClient();
      const path = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("post-images")
        .upload(path, resized.blob, { contentType: "image/jpeg" });

      if (error) {
        onError("Gagal mengunggah gambar.");
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from("post-images").getPublicUrl(path);
      onChange({ previewUrl, storageUrl: data.publicUrl, width: resized.width, height: resized.height });
    } catch {
      onError("Gagal memproses gambar.");
    } finally {
      setUploading(false);
    }
  }

  if (image) {
    return (
      <div className="relative mt-3 overflow-hidden rounded-[var(--radius-md)] border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.previewUrl}
          alt=""
          className="max-h-[420px] w-full object-cover"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        />
        <button
          onClick={() => onChange(null)}
          aria-label="Hapus gambar"
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
        aria-label="Lampirkan gambar"
        className="mt-2 flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] active:text-white disabled:opacity-50"
      >
        {uploading ? (
          <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/20 border-t-white" />
        ) : (
          <ImageIcon size={20} strokeWidth={2} />
        )}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
    </>
  );
}
