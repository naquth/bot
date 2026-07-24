"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { deleteOwnAccount } from "@/app/actions";
import { useToast } from "@/components/toast";

const CONFIRM_WORD = "HAPUS";

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const canDelete = confirmText === CONFIRM_WORD;

  function handleDelete() {
    if (!canDelete || isPending) return;
    startTransition(async () => {
      const res = await deleteOwnAccount();
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        showToast(res.error ?? "Gagal menghapus akun", "error");
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
        className="animate-sheet-up w-full max-w-[420px] rounded-t-[28px] border border-white/10 bg-[#0A0A0B] p-5 sm:rounded-[28px]"
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={19} className="text-[var(--color-like)]" />
          <h2 className="font-display text-[17.5px] font-bold tracking-[-0.01em] text-white">Hapus akun</h2>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-dim)]">
          Tindakan ini <span className="font-bold text-white">permanen dan tidak dapat dibatalkan</span>. Semua
          utas, pesan, follower, dan data lain milikmu akan dihapus selamanya.
        </p>

        <label className="mt-4 block text-[13.5px] font-medium text-[var(--color-text-dim)]">
          Ketik <span className="font-bold text-white">{CONFIRM_WORD}</span> untuk melanjutkan
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoFocus
          className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-white/15 bg-[var(--color-surface-2)] px-3.5 py-3 text-[15px] text-white placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-like)]/50 focus:outline-none"
        />

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-[14px] font-bold text-[var(--color-text-dim)] transition-colors active:bg-white/[0.07] active:text-white"
          >
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || isPending}
            className="rounded-full bg-[var(--color-like)] px-5 py-2.5 text-[14px] font-bold text-white transition-all active:scale-[0.96] disabled:opacity-30"
          >
            {isPending ? "Menghapus…" : "Hapus akun permanen"}
          </button>
        </div>
      </div>
    </div>
  );
}
