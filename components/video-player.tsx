"use client";

import { useState, useRef } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  posterUrl,
  width,
  height,
  durationSec,
}: {
  src: string;
  posterUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  function handlePlayToggle(e: React.MouseEvent) {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.play();
      setPlaying(true);
    }
  }

  function handleMuteToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setMuted((m) => !m);
  }

  return (
    <div
      onClick={handlePlayToggle}
      className="relative mt-3 w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-black"
      style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        muted={muted}
        playsInline
        loop
        className="h-full w-full object-contain"
        onEnded={() => setPlaying(false)}
      />

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
            <Play size={26} strokeWidth={0} className="ml-1 fill-black" />
          </div>
        </div>
      )}

      {playing && (
        <button
          onClick={handleMuteToggle}
          aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform active:scale-90"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}

      {!playing && durationSec != null && (
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-1 text-[12px] font-bold text-white backdrop-blur-sm">
          {formatDuration(durationSec)}
        </span>
      )}
    </div>
  );
}
