"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Trash2, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type PendingVoiceNote = { path: string; previewUrl: string; durationSec: number };

const MAX_DURATION_SEC = 120;
// Batas waktu tunggu setelah recorder.stop() dipanggil. MediaRecorder.onstop
// TERDOKUMENTASI TIDAK RELIABLE di Safari/iOS (dilaporkan gagal terpicu
// sekitar 40% dari waktu, acak, terutama iOS 15) — kalau onstop tidak
// pernah terpanggil, ondataavailable juga tidak pernah dapat chunk
// terakhir, dan seluruh alur pengiriman diam total tanpa pesan error apa
// pun ke user. Timeout ini jadi jaring pengaman: kalau onstop belum juga
// terpicu dalam waktu ini, proses paksa apa pun yang sudah terkumpul di
// chunksRef secara manual.
const STOP_FALLBACK_MS = 1200;

// Constraint audio eksplisit, BUKAN cuma `{ audio: true }` polos. Tanpa ini,
// browser berbeda menerapkan default yang tidak konsisten untuk auto gain
// control/echo cancellation/noise suppression — sebagian menerapkannya
// sangat agresif (memotong volume drastis di beberapa mic/device), sebagian
// lain mematikannya total tergantung kondisi lain (mis. WebRTC aktif atau
// tidak). Menentukan eksplisit membuat hasil rekaman lebih konsisten across
// device, dan autoGainControl:true membantu menyamakan level volume yang
// sebelumnya sering terasa "sangat kecil" di beberapa HP.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Bitrate default MediaRecorder untuk audio kadang sangat rendah di
// beberapa implementasi browser, menghasilkan suara yang terdengar pelan
// atau kualitasnya jelek. 128kbps cukup untuk suara bicara yang jernih
// tanpa membuat file jadi terlalu besar (voice note maks 120 detik × 128kbps
// ÷ 8 ≈ 1.9MB, jauh di bawah limit bucket 10MB).
const AUDIO_BITS_PER_SECOND = 128_000;

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function VoiceRecorder({
  userId,
  conversationId,
  onRecorded,
  onError,
}: {
  userId: string;
  conversationId: string;
  onRecorded: (note: PendingVoiceNote) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Mencegah finalize (upload) berjalan dua kali kalau onstop event asli
  // DAN fallback timeout sama-sama terpicu (mis. onstop ternyata cuma
  // telat, bukan benar-benar tidak terpicu).
  const finalizedRef = useRef(false);
  const stopFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeTypeRef = useRef("");

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (stopFallbackTimerRef.current) clearTimeout(stopFallbackTimerRef.current);
    stopFallbackTimerRef.current = null;
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const finalizeRecording = useCallback(async () => {
    if (finalizedRef.current) {
      console.log("[voice-note] finalizeRecording dipanggil lagi tapi sudah pernah finalize, diabaikan");
      return;
    }
    finalizedRef.current = true;
    cleanupStream();
    console.log("[voice-note] finalizeRecording mulai, cancelled:", cancelledRef.current, "jumlah chunk:", chunksRef.current.length);
    if (cancelledRef.current) return;

    const durationSec = (Date.now() - startTimeRef.current) / 1000;
    if (chunksRef.current.length === 0) {
      // Ini kondisi yang persis terjadi kalau MediaRecorder.onstop gagal
      // terpicu dan ondataavailable juga tidak sempat memberi chunk apa
      // pun — sebelumnya kondisi ini membuat seluruh alur diam total tanpa
      // pesan apa pun ke user ("dipencet, tidak terjadi apa-apa").
      console.error("[voice-note] tidak ada chunk sama sekali — onstop/ondataavailable gagal total");
      onError("Rekaman gagal diproses. Coba rekam ulang.");
      return;
    }
    if (durationSec < 0.6) {
      console.warn("[voice-note] rekaman terlalu pendek:", durationSec, "detik");
      onError("Rekaman terlalu pendek.");
      return;
    }

    const mimeType = mimeTypeRef.current;
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    const previewUrl = URL.createObjectURL(blob);
    console.log("[voice-note] blob siap — size:", blob.size, "bytes, type:", blob.type, "durasi:", durationSec.toFixed(1), "detik");

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("[voice-note] auth user saat upload:", user?.id ?? "TIDAK ADA — sesi mungkin sudah expired");

      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
      const path = `${userId}/${conversationId}/${Date.now()}.${ext}`;
      console.log("[voice-note] mengunggah ke path:", path);
      const { error } = await supabase.storage
        .from("voice-notes")
        .upload(path, blob, { contentType: mimeType || "audio/webm" });

      if (error) {
        // Sebelumnya pesan error ke user selalu generik ("Gagal mengunggah
        // voice note"), menyembunyikan detail asli dari Supabase (mis.
        // pelanggaran RLS, bucket tidak ditemukan, dsb) yang sangat
        // dibutuhkan untuk diagnosis kenapa upload gagal.
        console.error("[voice-note] upload GAGAL:", error);
        onError(`Gagal mengunggah voice note: ${error.message}`);
        return;
      }

      console.log("[voice-note] upload berhasil, memanggil onRecorded");
      onRecorded({ path, previewUrl, durationSec });
    } catch (err) {
      console.error("[voice-note] exception saat upload:", err);
      onError("Gagal mengunggah voice note.");
    } finally {
      setUploading(false);
    }
  }, [cleanupStream, conversationId, onError, onRecorded, userId]);

  const stopRecording = useCallback(() => {
    console.log("[voice-note] stopRecording dipanggil, recorder state:", mediaRecorderRef.current?.state);
    setRecording((wasRecording) => {
      if (wasRecording) {
        mediaRecorderRef.current?.stop();
        // Jaring pengaman: kalau onstop tidak terpicu sama sekali dalam
        // waktu wajar (dilaporkan terjadi ~40% acak di Safari/iOS 15),
        // paksa finalize pakai chunk yang sudah sempat terkumpul lewat
        // ondataavailable, alih-alih diam selamanya.
        if (stopFallbackTimerRef.current) clearTimeout(stopFallbackTimerRef.current);
        stopFallbackTimerRef.current = setTimeout(() => {
          console.warn("[voice-note] onstop tidak terpicu dalam", STOP_FALLBACK_MS, "ms — memakai fallback finalize");
          void finalizeRecording();
        }, STOP_FALLBACK_MS);
      }
      return false;
    });
  }, [finalizeRecording]);

  async function startRecording() {
    if (recording || uploading) return;
    cancelledRef.current = false;
    finalizedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      console.log("[voice-note] mulai rekam — mimeType dipilih:", mimeType || "(default browser)");
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, recorderOptions);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        console.log("[voice-note] ondataavailable — size:", e.data.size, "bytes");
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        console.log("[voice-note] event onstop terpicu (normal)");
        void finalizeRecording();
      };

      recorder.onerror = (e) => {
        console.error("[voice-note] MediaRecorder error:", e);
        onError("Terjadi kesalahan saat merekam. Coba lagi.");
        cleanupStream();
        setRecording(false);
      };

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      // timeslice 1 detik: memaksa ondataavailable terpicu berkala selama
      // perekaman (bukan cuma sekali di akhir), supaya kalau onstop gagal
      // terpicu, chunksRef tetap sudah terisi data untuk fallback finalize
      // di atas — tanpa timeslice, semua data cuma "dijanjikan" keluar
      // saat stop() sukses, yang justru rawan hilang kalau stop()-nya
      // sendiri yang bermasalah.
      recorder.start(1000);
      setRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsedSec(elapsed);
        if (elapsed >= MAX_DURATION_SEC) stopRecording();
      }, 200);
    } catch (err) {
      console.error("[voice-note] gagal getUserMedia/inisialisasi MediaRecorder:", err);
      onError("Tidak bisa mengakses mikrofon. Cek izin browser kamu.");
    }
  }

  function cancelRecording() {
    if (!recording) return;
    cancelledRef.current = true;
    setRecording(false);
    mediaRecorderRef.current?.stop();
  }

  if (uploading) {
    return (
      <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <span className="text-[13.5px] text-[var(--color-text-dim)]">Mengunggah voice note…</span>
      </div>
    );
  }

  if (recording) {
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    return (
      <div className="flex h-11 flex-1 items-center gap-3 rounded-[20px] border border-[var(--color-like)]/40 bg-[var(--color-like)]/10 px-4">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-like)] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-like)]" />
        </span>
        <span className="flex-1 font-mono text-[14px] tabular-nums text-white">
          {mins}:{secs.toString().padStart(2, "0")}
        </span>
        <button
          onClick={cancelRecording}
          aria-label="Batalkan rekaman"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-white/10"
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
        <button
          onClick={stopRecording}
          aria-label="Selesai rekam"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-like)] text-white transition-transform active:scale-90"
        >
          <Square size={13} strokeWidth={2.5} fill="white" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      aria-label="Rekam voice note"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] active:text-white"
    >
      <Mic size={20} strokeWidth={2} />
    </button>
  );
}
