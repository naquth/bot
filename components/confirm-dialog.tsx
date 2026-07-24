"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  // CATATAN PERBAIKAN (revisi): overflow-y-auto sempat ditaruh di overlay
  // LUAR untuk cegah sheet overflow ke atas, tapi itu bikin Chrome
  // menerapkan "safe alignment" — align-items: flex-end otomatis jadi
  // flex-start di flex container yang overflow: auto, jadi sheet malah
  // nempel di ATAS bukan di BAWAH (persis bug "tampilan blokir tidak
  // responsif" yang dilaporkan). Overflow sekarang cuma di sheet bagian
  // dalam (dengan max-h sendiri), overlay luar bukan scroll container lagi.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up max-h-[85dvh] w-full max-w-[380px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#151517] p-5 shadow-[0_12px_50px_rgba(0,0,0,0.7)] sm:rounded-[28px]"
      >
        <h2 id="confirm-title" className="font-display text-[17.5px] font-bold tracking-[-0.01em] text-white">
          {title}
        </h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-text-dim)]">{description}</p>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/[0.14] py-3 text-[14.5px] font-bold text-white transition-colors active:bg-white/[0.07]"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className={
              destructive
                ? "flex-1 rounded-full bg-[var(--color-like)] py-3 text-[14.5px] font-bold text-white transition-opacity active:opacity-80"
                : "flex-1 rounded-full bg-white py-3 text-[14.5px] font-bold text-black transition-opacity active:opacity-80"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
