"use client";

import { useCallback, useEffect, useRef } from "react";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, PhoneMissed } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { useWebRTCCall } from "@/lib/webrtc/use-webrtc-call";

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallOverlay({
  call,
  selfUserId,
}: {
  call: ReturnType<typeof useWebRTCCall>;
  selfUserId: string;
}) {
  const {
    status,
    kind,
    peerInfo,
    elapsedSec,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    resetToIdle,
  } = call;

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  void selfUserId;

  // Elemen <video> lokal/remote dirender secara kondisional (baru muncul
  // di DOM setelah localStream/remoteStream ada isinya). Kalau assignment
  // srcObject cuma lewat useEffect biasa yang bergantung pada ref sudah
  // ter-attach lebih dulu, ada celah race: effect jalan sebelum React
  // selesai mount elemen barunya, jadi srcObject tidak pernah ke-set dan
  // video tetap hitam walau stream-nya sendiri sudah ada. Callback ref di
  // bawah men-set srcObject persis saat elemen benar-benar ter-attach ke
  // DOM, jadi tidak bergantung pada timing render/effect sama sekali.
  //
  // PENTING (fix kedipan video): callback ref ini WAJIB dibungkus
  // useCallback dengan deps yang tepat. Tanpa itu, fungsi ini jadi baru di
  // SETIAP render — dan komponen ini re-render setiap detik (elapsedSec
  // dari timer durasi panggilan). Saat React melihat prop `ref` berubah
  // reference, ia akan memanggil ref lama dengan null (detach) lalu ref
  // baru dengan elemen (attach ulang) — jadi srcObject ter-assign ulang
  // setiap detik walau streamnya sama persis, dan itulah yang membuat
  // video terlihat berkedip terus-menerus.
  const attachLocalVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoRef.current = el;
      if (el && el.srcObject !== localStream) el.srcObject = localStream;
    },
    [localStream]
  );
  const attachRemoteVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      remoteVideoRef.current = el;
      if (el && el.srcObject !== remoteStream) {
        el.srcObject = remoteStream;
        if (remoteStream) {
          // Sama seperti attachRemoteAudio: video call membawa audio track
          // di stream yang sama, dan autoplay-nya bisa ditolak browser
          // secara diam-diam. play() dipanggil eksplisit supaya rejection
          // ter-log, bukan hilang tanpa jejak.
          el.play().catch((err) => {
            console.error("[call] video.play() ditolak browser (kemungkinan autoplay policy):", err);
          });
        }
      }
    },
    [remoteStream]
  );
  const attachRemoteAudio = useCallback(
    (el: HTMLAudioElement | null) => {
      remoteAudioRef.current = el;
      if (el && el.srcObject !== remoteStream) {
        el.srcObject = remoteStream;
        if (remoteStream) {
          // Browser autoplay policy kadang MENOLAK play() secara diam-diam
          // (promise reject, tanpa exception yang terlihat), terutama kalau
          // browser menganggap belum ada "user gesture" yang cukup baru di
          // halaman ini. srcObject sudah benar ter-assign, tapi elemen
          // audio tetap tidak bersuara sama sekali — ini penyebab paling
          // mungkin dari laporan "kadang tidak ada suara", karena
          // bergantung pada timing/kondisi user-gesture yang bervariasi
          // antar device/browser. play() dipanggil eksplisit di sini
          // (bukan cuma mengandalkan atribut `autoplay`) supaya rejection-
          // nya benar-benar tertangkap dan ter-log, bukan hilang senyap.
          el.play().catch((err) => {
            console.error("[call] audio.play() ditolak browser (kemungkinan autoplay policy):", err);
          });
        }
      }
    },
    [remoteStream]
  );

  // Catatan: assignment srcObject untuk video/audio lokal & remote SUDAH
  // ditangani sepenuhnya oleh callback ref (attachLocalVideo/
  // attachRemoteVideo/attachRemoteAudio) di atas — itulah satu-satunya
  // sumber kebenaran untuk kapan srcObject di-set dan play() dipanggil.
  // useEffect terpisah yang dulu ada di sini redundan dan berisiko
  // menyebabkan assignment ganda / percobaan play() ganda yang bisa saling
  // tumpang tindih dengan callback ref di atas.

  // Status akhir yang cuma tampil sekilas lalu kembali idle otomatis.
  useEffect(() => {
    if (status === "ended" || status === "rejected" || status === "busy" || status === "failed" || status === "no-answer") {
      const t = setTimeout(() => resetToIdle(), 1600);
      return () => clearTimeout(t);
    }
  }, [status, resetToIdle]);

  if (status === "idle") return null;

  const isVideo = kind === "video";
  const isActiveCall = status === "connecting" || status === "connected";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      {isVideo && isActiveCall ? (
        <video ref={attachRemoteVideo} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover bg-black" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#161821] to-black" />
      )}

      {!isVideo && <audio ref={attachRemoteAudio} autoPlay />}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-between px-6 py-12">
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          {(!isVideo || !isActiveCall || !remoteStream) && peerInfo && (
            <Avatar
              username={peerInfo.username}
              displayName={peerInfo.displayName}
              avatarUrl={peerInfo.avatarUrl}
              size="xl"
            />
          )}
          <h2 className="mt-2 font-display text-[22px] font-bold tracking-[-0.015em]">
            {peerInfo?.displayName ?? "Pengguna"}
          </h2>
          <p className="text-[14.5px] text-white/60">
            {status === "ringing-outgoing" && "Memanggil…"}
            {status === "ringing-incoming" && (isVideo ? "Video call masuk…" : "Panggilan masuk…")}
            {status === "connecting" && "Menyambungkan…"}
            {status === "connected" && formatDuration(elapsedSec)}
            {status === "ended" && "Panggilan berakhir"}
            {status === "rejected" && "Panggilan ditolak"}
            {status === "busy" && "Sedang di panggilan lain"}
            {status === "no-answer" && "Tidak ada jawaban"}
            {status === "failed" && "Gagal menyambung"}
          </p>
        </div>

        {isVideo && isActiveCall && localStream && !isCameraOff && (
          <video
            ref={attachLocalVideo}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-12 h-[168px] w-[112px] rounded-[16px] border border-white/15 object-cover shadow-lg"
          />
        )}

        <div className="flex w-full max-w-[340px] items-center justify-center gap-5">
          {status === "ringing-incoming" ? (
            <>
              <CallButton onClick={rejectCall} variant="danger" label="Tolak">
                <PhoneMissed size={24} strokeWidth={2} />
              </CallButton>
              <CallButton onClick={acceptCall} variant="accept" label="Terima">
                {isVideo ? <Video size={24} strokeWidth={2} /> : <Phone size={24} strokeWidth={2} />}
              </CallButton>
            </>
          ) : isActiveCall ? (
            <>
              <CallButton onClick={toggleMute} variant={isMuted ? "active" : "neutral"} label={isMuted ? "Bunyikan" : "Bisukan"}>
                {isMuted ? <MicOff size={22} strokeWidth={2} /> : <Mic size={22} strokeWidth={2} />}
              </CallButton>
              {isVideo && (
                <CallButton onClick={toggleCamera} variant={isCameraOff ? "active" : "neutral"} label={isCameraOff ? "Nyalakan kamera" : "Matikan kamera"}>
                  {isCameraOff ? <VideoOff size={22} strokeWidth={2} /> : <Video size={22} strokeWidth={2} />}
                </CallButton>
              )}
              <CallButton onClick={endCall} variant="danger" label="Tutup">
                <PhoneOff size={24} strokeWidth={2} />
              </CallButton>
            </>
          ) : status === "ringing-outgoing" ? (
            <CallButton onClick={endCall} variant="danger" label="Batalkan">
              <PhoneOff size={24} strokeWidth={2} />
            </CallButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CallButton({
  onClick,
  variant,
  label,
  children,
}: {
  onClick: () => void;
  variant: "danger" | "accept" | "neutral" | "active";
  label: string;
  children: React.ReactNode;
}) {
  const styles: Record<"danger" | "accept" | "neutral" | "active", string> = {
    danger: "bg-[var(--color-like)] text-white",
    accept: "bg-[#2ecc71] text-white",
    neutral: "bg-white/15 text-white",
    active: "bg-white text-black",
  };

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-[60px] w-[60px] items-center justify-center rounded-full transition-transform active:scale-90 ${styles[variant]}`}
      style={{ transitionTimingFunction: "var(--ease-spring)" }}
    >
      {children}
    </button>
  );
}
