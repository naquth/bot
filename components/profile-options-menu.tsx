"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Flag, Ban, ShieldCheck, BadgeCheck, VolumeX, Volume2 } from "lucide-react";
import { toggleBlock, toggleMute, adminSetVerified } from "@/app/actions";
import { ReportDialog } from "@/components/report-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

export function ProfileOptionsMenu({
  targetUserId,
  targetUsername,
  initiallyBlocked,
  initiallyMuted,
  isAdmin = false,
  targetIsVerified = false,
}: {
  targetUserId: string;
  targetUsername: string;
  initiallyBlocked: boolean;
  initiallyMuted: boolean;
  isAdmin?: boolean;
  targetIsVerified?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [muted, setMuted] = useState(initiallyMuted);
  const [verified, setVerified] = useState(targetIsVerified);
  const [isPending, startTransition] = useTransition();

  function confirmToggleBlock() {
    setBlockConfirmOpen(false);
    const next = !blocked;
    setBlocked(next);
    startTransition(async () => {
      const ok = await toggleBlock(targetUserId, next);
      if (ok) {
        showToast(next ? `@${targetUsername} diblokir` : `Blokir @${targetUsername} dibuka`);
        router.refresh();
      } else {
        setBlocked(!next);
        showToast("Gagal memproses", "error");
      }
    });
  }

  function handleToggleMute() {
    setMenuOpen(false);
    const next = !muted;
    setMuted(next);
    startTransition(async () => {
      const ok = await toggleMute(targetUserId, next);
      if (ok) {
        showToast(next ? `@${targetUsername} dibisukan` : `@${targetUsername} tidak lagi dibisukan`);
      } else {
        setMuted(!next);
        showToast("Gagal memproses", "error");
      }
    });
  }

  function handleToggleVerified() {
    setMenuOpen(false);
    const next = !verified;
    setVerified(next);
    startTransition(async () => {
      const ok = await adminSetVerified(targetUserId, next);
      if (ok) {
        showToast(next ? "Akun diverifikasi" : "Verifikasi dicabut");
        router.refresh();
      } else {
        setVerified(!next);
        showToast("Gagal memproses", "error");
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Opsi lainnya"
        className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
      >
        <MoreHorizontal size={19} strokeWidth={2} />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="animate-slide-down absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-[#151517] shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
            <button
              onClick={handleToggleMute}
              disabled={isPending}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-[14.5px] font-medium text-white transition-colors active:bg-white/[0.07]"
            >
              {muted ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {muted ? "Batal bisukan" : "Bisukan akun"}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
              className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-[var(--color-like)] transition-colors active:bg-white/[0.07]"
            >
              <Flag size={17} />
              Laporkan akun
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setBlockConfirmOpen(true);
              }}
              disabled={isPending}
              className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-[var(--color-like)] transition-colors active:bg-white/[0.07]"
            >
              {blocked ? <ShieldCheck size={17} /> : <Ban size={17} />}
              {blocked ? "Buka blokir" : "Blokir akun"}
            </button>
            {isAdmin && (
              <button
                onClick={handleToggleVerified}
                disabled={isPending}
                className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3.5 text-[14.5px] font-medium text-[#4A9EFF] transition-colors active:bg-white/[0.07]"
              >
                <BadgeCheck size={17} />
                {verified ? "Cabut verifikasi" : "Verifikasi akun"}
              </button>
            )}
          </div>
        </>
      )}

      <ReportDialog open={reportOpen} target={{ type: "user", id: targetUserId }} onClose={() => setReportOpen(false)} />

      <ConfirmDialog
        open={blockConfirmOpen}
        title={blocked ? `Buka blokir @${targetUsername}?` : `Blokir @${targetUsername}?`}
        description={
          blocked
            ? "Kalian akan bisa saling melihat utas dan mengikuti lagi."
            : "Kalian akan berhenti saling mengikuti. Akun ini tidak akan muncul di feed-mu."
        }
        confirmLabel={blocked ? "Buka blokir" : "Blokir"}
        destructive={!blocked}
        onConfirm={confirmToggleBlock}
        onCancel={() => setBlockConfirmOpen(false)}
      />
    </div>
  );
}
