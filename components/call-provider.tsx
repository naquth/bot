"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { getMyCallableConversationIds } from "@/app/actions";
import { useWebRTCCall, type CallKind } from "@/lib/webrtc/use-webrtc-call";
import type { CallerInfo } from "@/lib/webrtc/call-signaling";
import { CallOverlay } from "@/components/call-overlay";

type CallContextValue = {
  startCall: (conversationId: string, kind: CallKind, peerInfo: CallerInfo) => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall harus dipakai di dalam CallProvider");
  return ctx;
}

export function CallProvider({
  userId,
  selfInfo,
  children,
}: {
  userId?: string;
  selfInfo?: CallerInfo;
  children: React.ReactNode;
}) {
  const call = useWebRTCCall(userId ?? "");
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    getMyCallableConversationIds().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        console.error("[call] gagal mengambil daftar conversation:", result.error);
        return;
      }
      console.log("[call] daftar conversation yang bisa ditelepon:", result.ids);
      listenerCleanupRef.current?.();
      listenerCleanupRef.current = call.listenOnConversations(result.ids);
    });

    return () => {
      cancelled = true;
      listenerCleanupRef.current?.();
      listenerCleanupRef.current = null;
    };
    // Sengaja tidak menaruh `call` di deps: fungsi listener dari hook stabil
    // secara referensi cukup untuk kebutuhan ini dan kita hanya perlu
    // re-subscribe saat userId berubah (login/logout), bukan tiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId) {
    return <>{children}</>;
  }

  return (
    <CallContext.Provider
      value={{
        startCall: (conversationId, kind, peerInfo) => {
          if (!selfInfo) {
            console.error("[call] tidak bisa memulai panggilan: profil diri sendiri belum tersedia");
            return;
          }
          call.startCall({ conversationId, kind, selfUserId: userId, selfInfo, peerInfo });
        },
      }}
    >
      {children}
      <CallOverlay call={call} selfUserId={userId} />
    </CallContext.Provider>
  );
}
