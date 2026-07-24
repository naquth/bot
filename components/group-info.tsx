"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Pencil, Check, X, UserMinus, LogOut, UserPlus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeAvatarImage } from "@/lib/resize-image";
import { renameGroup, updateGroupAvatar, removeGroupParticipant, leaveGroup, addGroupParticipants } from "@/app/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar } from "@/components/avatar";
import type { Profile } from "@/lib/types";

type Member = { id: string; username: string; display_name: string; avatar_url: string | null; isAdmin: boolean };

export function GroupInfo({
  conversationId,
  currentUserId,
  isAdmin,
  groupName,
  groupAvatarUrl,
  members,
}: {
  conversationId: string;
  currentUserId: string;
  isAdmin: boolean;
  groupName: string;
  groupAvatarUrl: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(groupName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(groupName);
  const [avatarUrl, setAvatarUrl] = useState(groupAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [memberList, setMemberList] = useState(members);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setEditingName(false);
      setNameDraft(name);
      return;
    }
    startTransition(async () => {
      const res = await renameGroup(conversationId, trimmed);
      if (res.ok) {
        setName(trimmed);
        setEditingName(false);
      } else {
        showToast(res.error ?? "Gagal mengganti nama", "error");
      }
    });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("File harus berupa gambar.", "error");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast("Ukuran gambar maksimal 3MB.", "error");
      return;
    }
    setUploading(true);
    try {
      const resized = await resizeAvatarImage(file);
      const supabase = createClient();
      const path = `group-avatars/${conversationId}/avatar.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, resized.blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (error) {
        showToast("Gagal mengunggah foto.", "error");
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`;
      const res = await updateGroupAvatar(conversationId, newUrl);
      if (res.ok) {
        setAvatarUrl(newUrl);
      } else {
        showToast(res.error ?? "Gagal menyimpan foto grup", "error");
      }
    } catch {
      showToast("Gagal memproses gambar.", "error");
    } finally {
      setUploading(false);
    }
  }

  function confirmRemoveMember() {
    if (!memberToRemove) return;
    const target = memberToRemove;
    setMemberToRemove(null);
    setMemberList((prev) => prev.filter((m) => m.id !== target.id));
    startTransition(async () => {
      const res = await removeGroupParticipant(conversationId, target.id);
      if (!res.ok) showToast(res.error ?? "Gagal mengeluarkan anggota", "error");
    });
  }

  function handleLeave() {
    setConfirmLeave(false);
    startTransition(async () => {
      const res = await leaveGroup(conversationId);
      if (res.ok) {
        router.push("/pesan");
      } else {
        showToast(res.error ?? "Gagal keluar dari grup", "error");
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col pb-10">
      <div className="flex flex-col items-center gap-3 border-b border-[var(--color-border)] px-4 py-7">
        <div className="relative">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="h-24 w-24 rounded-full object-cover ring-1 ring-white/[0.08]" />
          ) : (
            <Avatar username="grup" displayName={name} size="xl" />
          )}
          {isAdmin && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Ganti foto grup"
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black ring-2 ring-black transition-transform active:scale-90"
            >
              {uploading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <Camera size={15} strokeWidth={2.25} />
              )}
            </button>
          )}
          {isAdmin && (
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          )}
        </div>

        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={50}
              className="rounded-[var(--radius-sm)] border border-white/20 bg-[var(--color-surface-2)] px-3 py-1.5 text-center text-[16px] font-bold text-white focus:border-white/40 focus:outline-none"
            />
            <button
              onClick={handleSaveName}
              disabled={isPending}
              aria-label="Simpan nama"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black active:scale-90"
            >
              <Check size={16} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => {
                setEditingName(false);
                setNameDraft(name);
              }}
              aria-label="Batal"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-white active:scale-90"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <p className="font-display text-[19px] font-bold text-white">{name}</p>
            {isAdmin && (
              <button
                onClick={() => setEditingName(true)}
                aria-label="Edit nama grup"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
        <p className="text-[13.5px] text-[var(--color-text-dim)]">{memberList.length + 1} anggota</p>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">Anggota</p>
        {isAdmin && (
          <button
            onClick={() => setShowAddMembers(true)}
            className="flex items-center gap-1 text-[13px] font-semibold text-white active:opacity-70"
          >
            <UserPlus size={15} strokeWidth={2.25} />
            Tambah
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <Avatar username="kamu" displayName="Kamu" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-white">Kamu</p>
        </div>
        {isAdmin && <span className="text-[12px] font-semibold text-[var(--color-text-faint)]">Admin</span>}
      </div>

      {memberList.map((m) => (
        <div key={m.id} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Link href={`/profil/${m.username}`}>
            <Avatar username={m.username} displayName={m.display_name} avatarUrl={m.avatar_url} size="md" />
          </Link>
          <Link href={`/profil/${m.username}`} className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold text-white">{m.display_name}</p>
            <p className="truncate text-[13px] text-[var(--color-text-faint)]">@{m.username}</p>
          </Link>
          {m.isAdmin && <span className="text-[12px] font-semibold text-[var(--color-text-faint)]">Admin</span>}
          {isAdmin && !m.isAdmin && (
            <button
              onClick={() => setMemberToRemove(m)}
              aria-label={`Keluarkan ${m.display_name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-like)] transition-colors active:bg-[var(--color-surface-3)]"
            >
              <UserMinus size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      ))}

      <div className="px-4 py-5">
        <button
          onClick={() => setConfirmLeave(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--color-like)]/30 py-3 text-[14.5px] font-bold text-[var(--color-like)] transition-colors active:bg-[var(--color-like)]/10"
        >
          <LogOut size={16} strokeWidth={2.25} />
          Keluar dari Grup
        </button>
      </div>

      <ConfirmDialog
        open={memberToRemove !== null}
        title={`Keluarkan ${memberToRemove?.display_name ?? ""}?`}
        description="Orang ini tidak akan bisa melihat pesan baru di grup setelah dikeluarkan."
        confirmLabel="Keluarkan"
        destructive
        onConfirm={confirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Keluar dari grup ini?"
        description="Kamu tidak akan menerima pesan baru dari grup ini lagi."
        confirmLabel="Keluar"
        destructive
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />

      {showAddMembers && (
        <AddMembersSheet
          conversationId={conversationId}
          currentUserId={currentUserId}
          existingMemberIds={[currentUserId, ...memberList.map((m) => m.id)]}
          onClose={() => setShowAddMembers(false)}
          onAdded={(added) => setMemberList((prev) => [...prev, ...added.map((p) => ({ ...p, isAdmin: false }))])}
        />
      )}
    </div>
  );
}

function AddMembersSheet({
  conversationId,
  currentUserId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  conversationId: string;
  currentUserId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onAdded: (members: Profile[]) => void;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const q = query.trim();
    const timeout = setTimeout(async () => {
      if (!q) {
        setResults([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUserId)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(20);
      setResults((data ?? []).filter((p) => !existingMemberIds.includes(p.id)));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, currentUserId, existingMemberIds]);

  function toggleSelect(profile: Profile) {
    setSelected((prev) => (prev.some((p) => p.id === profile.id) ? prev.filter((p) => p.id !== profile.id) : [...prev, profile]));
  }

  function handleAdd() {
    if (selected.length === 0 || isPending) return;
    startTransition(async () => {
      const res = await addGroupParticipants(
        conversationId,
        selected.map((p) => p.id)
      );
      if (res.ok) {
        onAdded(selected);
        onClose();
      } else {
        showToast(res.error ?? "Gagal menambahkan anggota", "error");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3">
        <button onClick={onClose} aria-label="Batal" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--color-surface-3)]">
          <X size={20} strokeWidth={2} />
        </button>
        <h2 className="font-display text-[16.5px] font-bold">Tambah Anggota</h2>
        <button
          onClick={handleAdd}
          disabled={selected.length === 0 || isPending}
          className="rounded-full bg-white px-4 py-1.5 text-[13.5px] font-bold text-black disabled:opacity-30"
        >
          {isPending ? "…" : "Tambah"}
        </button>
      </div>

      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5">
          <Search size={17} strokeWidth={2} className="text-[var(--color-text-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari orang…"
            className="flex-1 bg-transparent text-[14.5px] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.map((p) => {
          const isSelected = selected.some((s) => s.id === p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggleSelect(p)}
              className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors active:bg-white/[0.03]"
            >
              <Avatar username={p.username} displayName={p.display_name} avatarUrl={p.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-white">{p.display_name}</p>
                <p className="truncate text-[13px] text-[var(--color-text-faint)]">@{p.username}</p>
              </div>
              {isSelected && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                  <Check size={14} strokeWidth={3} className="text-black" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
