"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Check, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGroupConversation } from "@/app/actions";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import type { Profile } from "@/lib/types";

export function GroupCreator({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<"members" | "name">("members");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
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
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, currentUserId]);

  function toggleSelect(profile: Profile) {
    setSelected((prev) =>
      prev.some((p) => p.id === profile.id) ? prev.filter((p) => p.id !== profile.id) : [...prev, profile]
    );
  }

  function handleCreate() {
    const trimmed = groupName.trim();
    if (!trimmed || selected.length < 2 || isPending) return;
    startTransition(async () => {
      const res = await createGroupConversation(
        trimmed,
        selected.map((p) => p.id)
      );
      if (res.ok) {
        router.push(`/pesan/${res.id}`);
      } else {
        showToast(res.error ?? "Gagal membuat grup", "error");
      }
    });
  }

  if (step === "name") {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <Users size={24} strokeWidth={1.75} className="text-[var(--color-text-dim)]" />
          </div>
          <input
            autoFocus
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nama grup"
            maxLength={50}
            className="flex-1 bg-transparent text-[17px] font-semibold text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />
        </div>

        <div className="px-4 py-3">
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]">
            {selected.length + 1} anggota
          </p>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3">
            <Avatar username="kamu" displayName="Kamu" size="md" />
            <div>
              <p className="text-[14.5px] font-bold text-white">Kamu</p>
              <p className="text-[12.5px] text-[var(--color-text-faint)]">Admin grup</p>
            </div>
          </div>
          {selected.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-[var(--color-border)] py-3">
              <Avatar username={p.username} displayName={p.display_name} avatarUrl={p.avatar_url} size="md" />
              <p className="text-[14.5px] font-semibold text-white">{p.display_name}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3.5">
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || isPending}
            className="flex w-full items-center justify-center rounded-full bg-white py-3 text-[14.5px] font-bold text-black transition-all active:scale-[0.98] disabled:opacity-30"
          >
            {isPending ? "Membuat grup…" : "Buat Grup"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5">
          <Search size={17} strokeWidth={2} className="text-[var(--color-text-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari orang untuk ditambahkan…"
            className="flex-1 bg-transparent text-[14.5px] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] px-4 py-3">
          {selected.map((p) => (
            <button
              key={p.id}
              onClick={() => toggleSelect(p)}
              className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] py-1 pl-1 pr-2.5 transition-colors active:bg-[var(--color-surface-3)]"
            >
              <Avatar username={p.username} displayName={p.display_name} avatarUrl={p.avatar_url} size="sm" />
              <span className="text-[13px] font-semibold text-white">{p.display_name}</span>
              <X size={13} strokeWidth={2.5} className="text-[var(--color-text-dim)]" />
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query.trim() && (
          <p className="px-4 py-10 text-center text-[13.5px] text-[var(--color-text-dim)]">Tidak ditemukan.</p>
        )}
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

      <div className="border-t border-[var(--color-border)] px-4 py-3.5">
        <button
          onClick={() => setStep("name")}
          disabled={selected.length < 2}
          className="flex w-full items-center justify-center rounded-full bg-white py-3 text-[14.5px] font-bold text-black transition-all active:scale-[0.98] disabled:opacity-30"
        >
          {selected.length < 2 ? "Pilih minimal 2 orang" : `Lanjut (${selected.length} dipilih)`}
        </button>
      </div>
    </div>
  );
}
