"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, BarChart3, FileText, Check, Loader2, ChevronDown } from "lucide-react";
import { createPost, saveDraft, deleteDraft, publishDraft } from "@/app/actions";

import { MAX_POST_LEN as MAX_LEN } from "@/lib/constants";
import { Avatar } from "@/components/avatar";
import { ImagePicker, type PickedImage } from "@/components/image-picker";
import { VideoPicker, type PickedVideo } from "@/components/video-picker";
import { PollEditor, type PollDraft } from "@/components/poll-editor";
import { AiCaptionHelper } from "@/components/ai-caption-helper";
import { VisibilityPicker, visibilityMeta } from "@/components/visibility-picker";
import type { PostDraft, PostVisibility } from "@/lib/types";

const AUTOSAVE_DELAY_MS = 1500;

type SaveStatus = "idle" | "pending" | "saved" | "error";

export function FullComposer({
  authorId,
  authorUsername,
  authorDisplayName,
  authorAvatarUrl,
  initialDraft,
}: {
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  initialDraft?: PostDraft | null;
}) {
  const router = useRouter();
  // Sebelumnya semua navigasi "kembali" di halaman ini (X, buang, simpan-lalu-
  // keluar) pakai router.back() — itu murni mengikuti riwayat browser, BUKAN
  // "dari mana user logically membuka halaman ini". Akibatnya kalau user
  // sempat pernah membuka /tulis/draft di sesi yang sama (mis. lewat tombol
  // Draft, lalu balik, lalu buka /tulis baru buat nulis post baru),
  // router.back() dari /tulis (post baru, tanpa ?draft=) malah membawanya
  // ke /tulis/draft karena itu yang kebetulan ada di atas stack riwayat.
  // Sekarang tujuan "kembali" dihitung eksplisit dari initialDraft: kalau
  // sedang mengedit draft (dibuka lewat /tulis?draft=id), kembali ke daftar
  // draft; kalau menulis post baru (/tulis polos), kembali ke beranda.
  const closeHref = initialDraft ? "/tulis/draft" : "/";
  const [content, setContent] = useState(initialDraft?.content ?? "");
  const [visibility, setVisibility] = useState<PostVisibility>(initialDraft?.visibility ?? "public");
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [image, setImage] = useState<PickedImage | null>(
    initialDraft?.image_url
      ? {
          previewUrl: initialDraft.image_url,
          storageUrl: initialDraft.image_url,
          width: initialDraft.image_width ?? 0,
          height: initialDraft.image_height ?? 0,
        }
      : null
  );
  const [video, setVideo] = useState<PickedVideo | null>(
    initialDraft?.video_url
      ? {
          previewUrl: initialDraft.video_url,
          storageUrl: initialDraft.video_url,
          width: initialDraft.video_width ?? 0,
          height: initialDraft.video_height ?? 0,
          durationSec: initialDraft.video_duration_sec ?? 0,
          thumbnailUrl: initialDraft.video_thumbnail_url ?? "",
        }
      : null
  );
  const [poll, setPoll] = useState<PollDraft | null>(
    initialDraft?.poll_options
      ? { options: initialDraft.poll_options, durationHours: initialDraft.poll_duration_hours ?? 24 }
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isSavingManually, setIsSavingManually] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const isMountedRef = useRef(true);
  // Snapshot terakhir yang benar-benar tersimpan (dari draft awal, atau
  // setelah save manual). Dipakai untuk deteksi "ada perubahan belum
  // tersimpan" (isDirty) di bawah, tanpa auto-save diam-diam.
  const lastSavedSnapshotRef = useRef(
    JSON.stringify({
      content: initialDraft?.content ?? "",
      image: initialDraft?.image_url ?? null,
      video: initialDraft?.video_url ?? null,
      poll: initialDraft?.poll_options ?? null,
      visibility: initialDraft?.visibility ?? "public",
    })
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pct = Math.min(content.length / MAX_LEN, 1);
  const circumference = 2 * Math.PI * 9;
  const dashoffset = circumference * (1 - pct);
  const nearLimit = content.length > MAX_LEN * 0.85;
  const overLimit = content.length > MAX_LEN;
  const pollValid = !poll || poll.options.filter((o) => o.trim()).length >= 2;
  const hasAnyContent = content.trim().length > 0 || image !== null || video !== null || poll !== null;
  const canSubmit = hasAnyContent && !overLimit && pollValid && !isPending;
  const mediaLocked = image !== null || video !== null;
  const currentSnapshot = JSON.stringify({
    content,
    image: image?.storageUrl ?? null,
    video: video?.storageUrl ?? null,
    poll: poll?.options ?? null,
    visibility,
  });
  const isDirty = currentSnapshot !== lastSavedSnapshotRef.current;

  function buildDraftOptions() {
    return {
      draftId: draftId ?? undefined,
      image: image ? { url: image.storageUrl, width: image.width, height: image.height } : undefined,
      video: video
        ? {
            url: video.storageUrl,
            width: video.width,
            height: video.height,
            durationSec: video.durationSec,
            thumbnailUrl: video.thumbnailUrl,
          }
        : undefined,
      poll: poll ? { options: poll.options, durationHours: poll.durationHours } : undefined,
      visibility,
    };
  }

  // CATATAN PERBAIKAN: sebelumnya ada auto-save periodik (tiap 1500ms
  // setelah user berhenti mengetik) yang menyimpan draft ke server TANPA
  // sepengetahuan/izin user sama sekali. Ini bikin "Draft" di /profil penuh
  // draft yang sebenarnya tidak pernah diminta user untuk disimpan — user
  // cuma sempat ngetik sebentar lalu berubah pikiran, tapi tetap tersimpan
  // otomatis. Sekarang draft HANYA tersimpan lewat dua jalur yang eksplisit
  // atas aksi user: tombol "Simpan sebagai draft" (handleSaveDraftManually),
  // atau memilih "Simpan sebagai draft" di dialog konfirmasi saat user
  // menutup/kembali dengan konten yang belum tersimpan (lihat handleClose +
  // showLeaveConfirm di bawah).


  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const options = {
        image: image ? { url: image.storageUrl, width: image.width, height: image.height } : undefined,
        video: video
          ? {
              url: video.storageUrl,
              width: video.width,
              height: video.height,
              durationSec: video.durationSec,
              thumbnailUrl: video.thumbnailUrl,
            }
          : undefined,
        poll: poll ? { options: poll.options, durationHours: poll.durationHours } : undefined,
        visibility,
      };
      const res = draftId
        ? await publishDraft(draftId, content.trim(), options)
        : await createPost(content.trim(), options);

      if (res.ok) {
        router.push("/");
      } else {
        setError(res.error ?? "Gagal mengirim.");
      }
    });
  }

  function handleSaveDraftManually() {
    if (!hasAnyContent || isSavingManually) return;
    setIsSavingManually(true);
    setError(null);
    startTransition(async () => {
      const res = await saveDraft(content, buildDraftOptions());
      if (res.ok) {
        setDraftId(res.draftId);
        setSaveStatus("saved");
        lastSavedSnapshotRef.current = currentSnapshot;
        router.push("/tulis/draft");
      } else {
        setError(res.error ?? "Gagal menyimpan draft.");
        setIsSavingManually(false);
      }
    });
  }

  function handleClose() {
    // Sebelumnya fungsi ini langsung saveDraft() diam-diam lalu router.back()
    // tanpa pernah bertanya ke user — jadi draft "otomatis tersimpan" walau
    // user tidak pernah menekan tombol simpan. Sekarang: kalau tidak ada
    // perubahan yang belum tersimpan (konten kosong, atau draft ini memang
    // sudah persis sama dengan yang tersimpan terakhir), langsung kembali
    // tanpa tanya. Kalau ADA perubahan yang belum tersimpan, tampilkan
    // dialog supaya user yang memutuskan: simpan sebagai draft atau buang.
    if (!hasAnyContent || !isDirty) {
      router.push(closeHref);
      return;
    }
    setShowLeaveConfirm(true);
  }

  function handleConfirmSaveAndLeave() {
    setShowLeaveConfirm(false);
    startTransition(async () => {
      const res = await saveDraft(content, buildDraftOptions());
      if (res.ok) {
        router.push(closeHref);
      } else {
        setError(res.error ?? "Gagal menyimpan draft.");
      }
    });
  }

  function handleConfirmDiscardAndLeave() {
    setShowLeaveConfirm(false);
    if (draftId) {
      void deleteDraft(draftId);
    }
    router.push(closeHref);
  }

  function handleDiscardDraft() {
    if (draftId) {
      void deleteDraft(draftId);
    }
    router.push(closeHref);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <header className="flex h-[56px] items-center justify-between border-b border-[var(--color-border)] px-3">
        <button
          onClick={handleClose}
          aria-label="Tutup"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
        >
          <X size={20} strokeWidth={2} />
        </button>

        <SaveStatusIndicator status={saveStatus} />

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push("/tulis/draft")}
            aria-label="Lihat draft"
            className="flex h-9 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
          >
            <FileText size={16} strokeWidth={2} />
            Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-white px-5 py-2 text-[14px] font-bold text-black transition-all active:scale-[0.94] disabled:opacity-30"
          >
            {isPending && !isSavingManually ? "Mengirim…" : "Kirim"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-3 px-4 py-5">
        <Avatar username={authorUsername} displayName={authorDisplayName} avatarUrl={authorAvatarUrl} />
        <div className="min-w-0 flex-1">
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Ada apa hari ini?"
            rows={8}
            className="w-full resize-none bg-transparent text-[17px] leading-relaxed tracking-[-0.006em] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />

          {image && <ImagePicker userId={authorId} image={image} onChange={setImage} onError={setError} />}
          {video && <VideoPicker userId={authorId} video={video} onChange={setVideo} onError={setError} />}

          {poll && <PollEditor draft={poll} onChange={setPoll} onRemove={() => setPoll(null)} />}

          {showAiHelper && (
            <AiCaptionHelper
              currentContent={content}
              onPick={(text) => {
                setContent(text);
                setShowAiHelper(false);
              }}
              onClose={() => setShowAiHelper(false)}
            />
          )}

          <button
            onClick={() => setShowVisibilityPicker(true)}
            className="mt-3 flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
          >
            {(() => {
              const meta = visibilityMeta(visibility);
              const Icon = meta.icon;
              return (
                <>
                  <Icon size={14} strokeWidth={2} />
                  {meta.label}
                  <ChevronDown size={14} strokeWidth={2} />
                </>
              );
            })()}
          </button>

          {error && <p className="mt-2 text-[13.5px] text-[var(--color-like)]">{error}</p>}
        </div>
      </div>

      <VisibilityPicker
        open={showVisibilityPicker}
        value={visibility}
        onSelect={setVisibility}
        onClose={() => setShowVisibilityPicker(false)}
      />

      <div className="flex items-center justify-between gap-2.5 border-t border-[var(--color-border)] px-4 py-3.5">
        <div className="flex items-center gap-1">
          {!poll && !video && !image && (
            <div className="-mt-2">
              <ImagePicker userId={authorId} image={image} onChange={setImage} onError={setError} />
            </div>
          )}
          {!poll && !image && !video && (
            <div className="-mt-2">
              <VideoPicker userId={authorId} video={video} onChange={setVideo} onError={setError} />
            </div>
          )}
          {!mediaLocked && (
            <button
              onClick={() => (poll ? setPoll(null) : setPoll({ options: ["", ""], durationHours: 24 }))}
              aria-label={poll ? "Hapus poll" : "Buat poll"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)] ${poll ? "text-white" : "text-[var(--color-text-dim)]"}`}
            >
              <BarChart3 size={18} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={() => setShowAiHelper((v) => !v)}
            aria-label="Bantuan caption AI"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)] ${showAiHelper ? "text-white" : "text-[var(--color-text-dim)]"}`}
          >
            <Sparkles size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-border)" strokeWidth="2" />
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke={overLimit ? "var(--color-like)" : "white"}
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              transform="rotate(-90 12 12)"
              style={{ transition: "stroke-dashoffset 0.15s var(--ease-out)" }}
            />
          </svg>
          {nearLimit && (
            <span className={`text-[12.5px] tabular-nums ${overLimit ? "text-[var(--color-like)]" : "text-[var(--color-text-dim)]"}`}>
              {MAX_LEN - content.length}
            </span>
          )}
        </div>
      </div>

      {hasAnyContent && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
          <button
            onClick={handleDiscardDraft}
            className="text-[13.5px] font-medium text-[var(--color-text-dim)] transition-colors active:text-[var(--color-like)]"
          >
            Buang
          </button>
          <button
            onClick={handleSaveDraftManually}
            disabled={isSavingManually}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-[13.5px] font-semibold text-white transition-colors active:bg-[var(--color-surface-3)] disabled:opacity-50"
          >
            {isSavingManually ? (
              <>
                <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
                Menyimpan…
              </>
            ) : (
              "Simpan sebagai draft"
            )}
          </button>
        </div>
      )}

      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={() => setShowLeaveConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-confirm-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up max-h-[85dvh] w-full max-w-[380px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#151517] p-5 shadow-[0_12px_50px_rgba(0,0,0,0.7)] sm:rounded-[28px]"
          >
            <h2 id="leave-confirm-title" className="font-display text-[17.5px] font-bold tracking-[-0.01em] text-white">
              Simpan sebagai draft?
            </h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-text-dim)]">
              Kamu punya perubahan yang belum disimpan. Simpan sebagai draft supaya bisa dilanjutkan nanti, atau buang saja.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={handleConfirmSaveAndLeave}
                className="w-full rounded-full bg-white py-3 text-[14.5px] font-bold text-black transition-opacity active:opacity-80"
              >
                Simpan sebagai draft
              </button>
              <button
                onClick={handleConfirmDiscardAndLeave}
                className="w-full rounded-full bg-[var(--color-like)] py-3 text-[14.5px] font-bold text-white transition-opacity active:opacity-80"
              >
                Buang
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="w-full rounded-full border border-white/[0.14] py-3 text-[14.5px] font-bold text-white transition-colors active:bg-white/[0.07]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return <div />;

  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-faint)]">
      {status === "pending" && (
        <>
          <Loader2 size={13} strokeWidth={2.5} className="animate-spin" />
          <span>Menyimpan draft…</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check size={13} strokeWidth={2.5} className="text-[var(--color-text-dim)]" />
          <span>Tersimpan sebagai draft</span>
        </>
      )}
      {status === "error" && <span className="text-[var(--color-like)]">Gagal menyimpan draft</span>}
    </div>
  );
}
