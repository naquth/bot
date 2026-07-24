"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldAlert, Check, X, Trash2, Sparkles, RotateCw, AlertTriangle } from "lucide-react";
import { getReports, updateReportStatus, adminDeletePost, type ReportRow } from "@/app/actions";
import { moderateContent, type ModerationVerdict } from "@/app/ai-actions";
import { useToast } from "@/components/toast";

const CATEGORY_LABELS: Record<ModerationVerdict["category"], string> = {
  aman: "Aman",
  spam: "Spam",
  pelecehan: "Pelecehan",
  ujaran_kebencian: "Ujaran kebencian",
  kekerasan: "Kekerasan",
  lainnya: "Lainnya",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Pelecehan",
  hate_speech: "Ujaran kebencian",
  violence: "Kekerasan",
  nudity: "Konten dewasa",
  misinformation: "Misinformasi",
  other: "Lainnya",
};

type Tab = "pending" | "reviewed" | "dismissed";

export function AdminReportList({ initialReports }: { initialReports: ReportRow[] }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [reports, setReports] = useState(initialReports);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [verdicts, setVerdicts] = useState<Record<string, ModerationVerdict>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const { showToast } = useToast();

  function checkWithAi(reportId: string, postId: string) {
    setCheckingId(reportId);
    startTransition(async () => {
      const res = await moderateContent(postId);
      setCheckingId(null);
      if (res.ok) {
        setVerdicts((prev) => ({ ...prev, [reportId]: res.data }));
      } else {
        showToast(res.error, "error");
      }
    });
  }

  async function switchTab(newTab: Tab) {
    setTab(newTab);
    setLoading(true);
    const data = await getReports(newTab);
    setReports(data);
    setLoading(false);
  }

  function handleDismiss(reportId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    startTransition(async () => {
      const res = await updateReportStatus(reportId, "dismissed");
      if (!res.ok) showToast(res.error ?? "Gagal", "error");
    });
  }

  function handleMarkReviewed(reportId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    startTransition(async () => {
      const res = await updateReportStatus(reportId, "reviewed");
      if (!res.ok) showToast(res.error ?? "Gagal", "error");
    });
  }

  function handleDeletePost(reportId: string, postId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    startTransition(async () => {
      const res = await adminDeletePost(postId);
      if (res.ok) {
        await updateReportStatus(reportId, "reviewed");
        showToast("Utas dihapus dan laporan ditandai selesai");
      } else {
        showToast(res.error ?? "Gagal menghapus utas", "error");
      }
    });
  }

  return (
    <div>
      <div className="flex border-b border-[var(--color-border)] px-4">
        {(["pending", "reviewed", "dismissed"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`relative px-4 py-3 text-[14px] font-bold transition-colors ${
              tab === t ? "text-white" : "text-[var(--color-text-faint)]"
            }`}
          >
            {t === "pending" ? "Menunggu" : t === "reviewed" ? "Ditindak" : "Ditolak"}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-white" />}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="px-4 py-10 text-center text-[14px] text-[var(--color-text-faint)]">Memuat…</p>
      ) : reports.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <ShieldAlert size={22} strokeWidth={1.75} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-4 font-display text-[16px] font-bold text-white">Tidak ada laporan</p>
        </div>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="border-b border-[var(--color-border)] px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold text-white">
                {REASON_LABELS[r.reason] ?? r.reason}
              </span>
              <span className="text-[12.5px] text-[var(--color-text-faint)]">
                oleh @{r.reporter?.username ?? "?"}
              </span>
            </div>

            {r.detail && <p className="mt-2 text-[14px] text-[var(--color-text-dim)]">{r.detail}</p>}

            {r.reported_post && (
              <Link
                href={`/utas/${r.reported_post.id}`}
                className="mt-2.5 block rounded-[var(--radius-sm)] border border-white/10 p-3 transition-colors active:bg-white/[0.03]"
              >
                <p className="text-[13px] font-bold text-white">@{r.reported_post.author?.username}</p>
                <p className="mt-1 line-clamp-2 text-[13.5px] text-[var(--color-text-dim)]">{r.reported_post.content}</p>
              </Link>
            )}

            {r.reported_post && (
              <div className="mt-2.5">
                {!verdicts[r.id] ? (
                  <button
                    onClick={() => checkWithAi(r.id, r.reported_post!.id)}
                    disabled={checkingId === r.id}
                    className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] disabled:opacity-50"
                  >
                    {checkingId === r.id ? (
                      <RotateCw size={13} className="animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Sparkles size={13} strokeWidth={2.25} />
                    )}
                    Cek dengan AI
                  </button>
                ) : (
                  <div
                    className={`flex items-start gap-2 rounded-[var(--radius-sm)] border p-2.5 text-[12.5px] ${
                      verdicts[r.id].flagged
                        ? "border-[var(--color-like)]/30 bg-[var(--color-like)]/10"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    {verdicts[r.id].flagged ? (
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--color-like)]" strokeWidth={2.25} />
                    ) : (
                      <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--color-text-dim)]" strokeWidth={2.25} />
                    )}
                    <div>
                      <p className={`font-bold ${verdicts[r.id].flagged ? "text-[var(--color-like)]" : "text-white"}`}>
                        AI: {CATEGORY_LABELS[verdicts[r.id].category]}
                      </p>
                      {verdicts[r.id].reason && (
                        <p className="mt-0.5 text-[var(--color-text-dim)]">{verdicts[r.id].reason}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {r.reported_user && (
              <Link
                href={`/profil/${r.reported_user.username}`}
                className="mt-2.5 block rounded-[var(--radius-sm)] border border-white/10 p-3 transition-colors active:bg-white/[0.03]"
              >
                <p className="text-[13.5px] font-bold text-white">{r.reported_user.display_name}</p>
                <p className="text-[13px] text-[var(--color-text-dim)]">@{r.reported_user.username}</p>
              </Link>
            )}

            {tab === "pending" && (
              <div className="mt-3 flex gap-2">
                {r.reported_post && (
                  <button
                    onClick={() => handleDeletePost(r.id, r.reported_post!.id)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-full bg-[var(--color-like)] px-3.5 py-2 text-[13px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    Hapus utas
                  </button>
                )}
                <button
                  onClick={() => handleMarkReviewed(r.id)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-[13px] font-bold text-white transition-colors active:bg-white/[0.06] disabled:opacity-40"
                >
                  <Check size={14} />
                  Tandai ditindak
                </button>
                <button
                  onClick={() => handleDismiss(r.id)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold text-[var(--color-text-dim)] transition-colors active:bg-white/[0.06] disabled:opacity-40"
                >
                  <X size={14} />
                  Tolak
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
