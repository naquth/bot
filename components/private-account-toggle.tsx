"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { togglePrivateAccount } from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function PrivateAccountToggle({ initialIsPrivate }: { initialIsPrivate: boolean }) {
  const router = useRouter();
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [confirming, setConfirming] = useState<"lock" | "unlock" | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleRequest() {
    setConfirming(isPrivate ? "unlock" : "lock");
  }

  function handleConfirm() {
    const next = !isPrivate;
    setConfirming(null);
    setIsPrivate(next);
    startTransition(async () => {
      const ok = await togglePrivateAccount(next);
      if (!ok) setIsPrivate(!next);
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3.5">
        <button
          onClick={handleToggleRequest}
          disabled={isPending}
          className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
        >
          <div className="flex items-start gap-3">
            <div
              className={
                isPrivate
                  ? "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white"
                  : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[var(--color-text-dim)]"
              }
            >
              {isPrivate ? <Lock size={16} strokeWidth={2} /> : <LockOpen size={16} strokeWidth={2} />}
            </div>
            <div>
              <p className="text-[15px] font-bold text-white">Akun privat</p>
              <p className="mt-0.5 max-w-[240px] text-[13px] leading-relaxed text-[var(--color-text-dim)]">
                {isPrivate
                  ? "Hanya pengikut yang disetujui dapat melihat utas dan daftar follow-mu."
                  : "Siapa pun dapat melihat utas dan profilmu tanpa perlu mengikuti."}
              </p>
            </div>
          </div>

          <span
            aria-hidden
            className={
              isPrivate
                ? "relative h-7 w-12 shrink-0 rounded-full bg-white transition-colors"
                : "relative h-7 w-12 shrink-0 rounded-full bg-white/[0.14] transition-colors"
            }
          >
            <span
              className={
                isPrivate
                  ? "absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-black transition-transform"
                  : "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform"
              }
            />
          </span>
        </button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "lock" ? "Kunci akunmu?" : "Buka akunmu?"}
        description={
          confirming === "lock"
            ? "Pengikut baru harus kamu setujui secara manual. Pengikutmu saat ini tidak terpengaruh dan tetap bisa melihat utasmu."
            : "Semua permintaan ikuti yang masih tertunda akan otomatis diterima, dan siapa pun bisa melihat profilmu tanpa mengikuti."
        }
        confirmLabel={confirming === "lock" ? "Kunci akun" : "Buka akun"}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
