"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { resizeAvatarImage } from "@/lib/resize-image";
import type { Profile } from "@/lib/types";

export function ProfileEditForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initials = displayName.slice(0, 2).toUpperCase();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 3MB.");
      return;
    }
    setError(null);
    setUploading(true);

    try {
      const resized = await resizeAvatarImage(file);
      const path = `${profile.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, resized.blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) {
        setError("Gagal mengunggah gambar.");
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch {
      setError("Gagal memproses gambar.");
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const ok = await updateProfile({ display_name: displayName, bio, avatar_url: avatarUrl });
      if (ok) {
        router.push(`/profil/${profile.username}`);
        router.refresh();
      } else {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-3)] font-display text-[22px] font-bold text-white ring-1 ring-white/[0.08]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-20 w-20 object-cover" />
          ) : (
            initials
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-white/[0.14] px-4 py-2 text-[14px] font-bold text-white transition-colors active:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          {uploading ? "Mengunggah…" : "Ganti foto"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--color-text-dim)]">Nama tampilan</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3.5 text-[15px] text-white focus:border-white/30 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--color-text-dim)]">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Ceritakan sedikit tentang dirimu"
            className="resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3.5 text-[15px] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/30 focus:outline-none"
          />
          <span className="self-end text-[12px] text-[var(--color-text-faint)]">{bio.length}/160</span>
        </label>

        {error && <p className="text-[13px] text-[var(--color-like)]">{error}</p>}

        <button
          onClick={handleSave}
          disabled={isPending || !displayName.trim()}
          className="mt-2 rounded-full bg-white py-3.5 text-[15px] font-bold text-black transition-all active:scale-[0.98] disabled:opacity-40"
        >
          {isPending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
