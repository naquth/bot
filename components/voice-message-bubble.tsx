"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { getVoiceNoteUrl } from "@/app/actions";

// Tinggi batang waveform statis (dekoratif, bukan analisis audio sungguhan)
// supaya bubble terasa hidup tanpa perlu Web Audio API yang berat di client.
const BAR_HEIGHTS = [6, 12, 8, 16, 10, 14, 7, 11, 15, 9, 13, 6, 10, 8, 12, 15, 7, 11, 9, 13];

export function VoiceMessageBubble({
  audioPath,
  durationSec,
  isMe,
}: {
  audioPath: string;
  durationSec: number;
  isMe: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function ensureUrlAndPlay() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    let src = url;
    if (!src) {
      setLoading(true);
      src = await getVoiceNoteUrl(audioPath);
      setLoading(false);
      if (!src) return;
      setUrl(src);
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audioRef.current.ontimeupdate = () => {
        const dur = audioRef.current?.duration || durationSec;
        setProgress(dur ? (audioRef.current!.currentTime / dur) * 100 : 0);
      };
    } else if (audioRef.current.src !== src) {
      audioRef.current.src = src;
    }

    audioRef.current.play();
    setPlaying(true);
  }

  const mins = Math.floor(durationSec / 60);
  const secs = Math.floor(durationSec % 60);
  const playedBars = Math.round((progress / 100) * BAR_HEIGHTS.length);

  return (
    <div
      className={`flex w-[220px] items-center gap-3 rounded-[20px] px-3.5 py-3 ${
        isMe ? "rounded-br-[6px] bg-white text-black" : "rounded-bl-[6px] bg-[var(--color-surface-2)] text-white"
      }`}
    >
      <button
        onClick={ensureUrlAndPlay}
        aria-label={playing ? "Jeda voice note" : "Putar voice note"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
          isMe ? "bg-black text-white" : "bg-white text-black"
        }`}
      >
        {loading ? (
          <div
            className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${
              isMe ? "border-white/30 border-t-white" : "border-black/30 border-t-black"
            }`}
          />
        ) : playing ? (
          <Pause size={14} strokeWidth={2.5} fill="currentColor" />
        ) : (
          <Play size={14} strokeWidth={2.5} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <div className="flex flex-1 items-center gap-[2.5px]">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="w-[2.5px] shrink-0 rounded-full transition-colors"
            style={{
              height: `${h}px`,
              backgroundColor: i < playedBars ? (isMe ? "#000" : "#fff") : isMe ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>

      <span className={`shrink-0 font-mono text-[11.5px] tabular-nums ${isMe ? "text-black/60" : "text-white/60"}`}>
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
