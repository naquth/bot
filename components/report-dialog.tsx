"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportPost, reportUser, type ReportReason } from "@/app/actions";
import { useToast } from "@/components/toast";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Pelecehan atau perundungan" },
  { value: "hate_speech", label: "Ujaran kebencian" },
  { value: "violence", label: "Kekerasan" },
  { value: "nudity", label: "Konten dewasa" },
  { value: "misinformation", label: "Informasi menyesatkan" },
  { value: "other", label: "Lainnya" },
];

export function ReportDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: { type: "post"; id: string } | { type: "user"; id: string };
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  if (!open) return null;

  function handleSubmit() {
    if (!reason || isPending) return;
    startTransition(async () => {
      const res =
        target.type === "post" ? await reportPost(target.id, reason, detail) : await reportUser(target.id, reason, detail);

      if (res.ok) {
        showToast("Laporan terkirim. Terima kasih.");
        onClose();
        setReason(null);
        setDetail("");
      } else {
        showToast(res.error ?? "Gagal mengirim laporan", "error");
      }
    });
  }

  // CATATAN PERBAIKAN: sebelumnya overlay ini "fixed inset-0 flex items-end"
  // TANPA overflow-y-auto, dan sheet di dalamnya tanpa batas tinggi (max-h).
  // Kalau konten sheet (daftar alasan laporan + textarea opsional) lebih
  // tinggi dari area layar yang terlihat (apalagi setelah dikurangi address
  // bar browser di HP), sheet-nya overflow ke ATAS melewati batas viewport
  // dan bagian atasnya kepotong tak terlihat — yang kelihatan cuma baris
  // tombol di bagian bawah sheet, nyangkut di ujung atas layar seperti di
  // laporan bug ("tampilan laporkan akun tidak responsif"). Sekarang overlay
  // bisa di-scroll dan sheet dibatasi max-h supaya kontennya scroll di
  // dalam sheet, bukan overflow keluar viewport.
  // CATATAN PERBAIKAN (revisi): percobaan sebelumnya menambah
  // overflow-y-auto di overlay LUAR (fixed inset-0 flex items-end) untuk
  // mencegah sheet overflow ke atas — tapi itu malah bikin masalah baru.
  // Di flex container yang overflow: auto, browser (Chrome) menerapkan
  // "safe alignment": align-items: flex-end/center otomatis diperlakukan
  // seperti flex-start kalau kontennya overflow, supaya bagian AWAL konten
  // tetap bisa diakses. Akibatnya sheet yang harusnya nempel di BAWAH malah
  // nempel di ATAS scroll container — persis seperti di laporan bug
  // (sheet muncul kepotong di ujung atas, bukan bottom sheet). Overflow
  // sekarang cuma ditaruh di sheet BAGIAN DALAM (yang punya max-h sendiri),
  // overlay luar tidak lagi jadi scroll container, jadi items-end tetap
  // konsisten menempel di bawah.
  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up max-h-[85dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0A0A0B] p-5 sm:rounded-[28px]"
      >
        <div className="flex items-center gap-2.5">
          <Flag size={19} className="text-[var(--color-like)]" />
          <h2 className="font-display text-[17.5px] font-bold tracking-[-0.01em] text-white">
            {target.type === "post" ? "Laporkan utas" : "Laporkan akun"}
          </h2>
        </div>
        <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">Pilih alasan yang paling sesuai.</p>

        <div className="mt-4 flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`flex items-center justify-between rounded-[var(--radius-sm)] border px-3.5 py-3 text-left text-[14.5px] font-medium transition-colors ${
                reason === r.value
                  ? "border-white bg-white/[0.06] text-white"
                  : "border-white/10 text-[var(--color-text-dim)] active:bg-white/[0.04]"
              }`}
            >
              {r.label}
              {reason === r.value && <span className="h-2 w-2 rounded-full bg-white" />}
            </button>
          ))}
        </div>

        {reason === "other" && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ceritakan lebih detail (opsional)"
            rows={2}
            maxLength={500}
            className="mt-3 w-full resize-none rounded-[var(--radius-sm)] border border-white/10 bg-[var(--color-surface-2)] p-3 text-[14px] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/30 focus:outline-none"
          />
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-[14px] font-bold text-[var(--color-text-dim)] transition-colors active:bg-white/[0.07] active:text-white"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || isPending}
            className="rounded-full bg-[var(--color-like)] px-5 py-2.5 text-[14px] font-bold text-white transition-all active:scale-[0.96] disabled:opacity-30"
          >
            {isPending ? "Mengirim…" : "Kirim laporan"}
          </button>
        </div>
      </div>
    </div>
  );
}
