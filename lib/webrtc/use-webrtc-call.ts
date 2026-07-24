"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  joinCallChannel,
  sendCallSignal,
  ICE_SERVERS,
  type CallSignal,
  type CallerInfo,
} from "@/lib/webrtc/call-signaling";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallStatus =
  | "idle"
  | "ringing-outgoing" // aku menelepon, menunggu dijawab
  | "ringing-incoming" // ada yang menelepon aku
  | "connecting" // sudah terima, sedang membentuk koneksi
  | "connected"
  | "ended"
  | "rejected"
  | "no-answer"
  | "failed"
  | "busy";

export type CallKind = "audio" | "video";

// Kalau tidak dijawab dalam waktu ini, panggilan keluar otomatis dianggap
// tidak terjawab — supaya layar "Memanggil…" tidak macet selamanya kalau
// penerima memang tidak online atau tab-nya di-background (di-throttle
// browser sehingga listener-nya telat/tidak sempat memproses).
const RING_TIMEOUT_MS = 45_000;

type StartCallOptions = {
  conversationId: string;
  kind: CallKind;
  selfUserId: string;
  // BUG YANG DIPERBAIKI: sebelumnya kode ini mengirim `peerInfo` (identitas
  // lawan bicara/target yang ditelepon) sebagai `signal.from` — padahal
  // `from` semestinya berisi identitas PENELEPON SENDIRI, karena itulah
  // yang perlu diketahui penerima ("siapa yang menelepon saya"). Akibatnya
  // penerima menerima signal.from = dirinya sendiri (karena "target" dari
  // sudut pandang penelepon = si penerima), dan overlay call di penerima
  // menampilkan namanya sendiri alih-alih nama penelepon. `selfInfo` di
  // bawah ini adalah identitas penelepon yang sebenarnya, dipakai untuk
  // `from`; `peerInfo` tetap dipakai untuk peerInfo lokal di sisi
  // penelepon sendiri (menampilkan siapa yang sedang ia telepon).
  selfInfo: CallerInfo;
  peerInfo: CallerInfo; // info lawan bicara, untuk ditampilkan di sisi penelepon sendiri
};

type IncomingCall = {
  conversationId: string;
  kind: CallKind;
  from: CallerInfo;
};

export function useWebRTCCall(selfUserId: string) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [kind, setKind] = useState<CallKind>("audio");
  const [peerInfo, setPeerInfo] = useState<CallerInfo | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  // BUG FATAL yang diperbaiki di sini: sebelumnya, begitu sinyal "offer"
  // tiba di sisi penerima, kode LANGSUNG memproses offer itu — membuat
  // answer dan mengirimnya balik — TANPA MENUNGGU user menekan tombol
  // "Terima" sama sekali. Karena penelepon mengirim "offer" segera setelah
  // "ring" terkirim (tidak menunggu jawaban apa pun), ini membuat panggilan
  // OTOMATIS TERSAMBUNG di sisi penerima tanpa interaksi user — penerima
  // tidak sempat menolak, dan kalaupun user tidak menekan apa-apa, koneksi
  // tetap terbentuk sendiri. offer yang masuk sebelum acceptCall() dipanggil
  // sekarang DITAHAN di sini dulu, baru benar-benar diproses setelah user
  // menekan "Terima".
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // BUG: acceptCall() dan handleSignal (saat menerima "offer") bisa
  // memanggil getLocalMedia() HAMPIR BERSAMAAN di sisi penerima — acceptCall
  // memanggilnya begitu user menekan "Terima", tapi offer dari penelepon
  // kadang sudah tiba sebelum getUserMedia() selesai (butuh waktu untuk
  // izin browser + inisialisasi kamera). Kalau keduanya memanggil
  // getUserMedia() secara independen, akan tercipta DUA MediaStream yang
  // berbeda — satu dipakai untuk addTrack() ke RTCPeerConnection (yang
  // benar-benar terkirim ke lawan bicara), satu lagi "menang" di
  // localStreamRef/setLocalStream (dipakai tombol mute/kamera). Akibatnya
  // tombol mute mengubah track di stream yang SALAH — tidak berefek apa
  // pun ke audio/video yang sungguhan dikirim. Promise in-flight ini
  // memastikan getUserMedia() hanya benar-benar dipanggil SEKALI per sesi
  // call, dan pemanggil kedua menunggu hasil yang sama.
  const localMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const kindRef = useRef<CallKind>("audio");
  // BUG UTAMA yang diperbaiki di sini: Supabase-js tidak mengizinkan dua
  // `subscribe()` aktif ke topik channel yang SAMA dari client yang sama —
  // percobaan subscribe kedua akan MENGGANTUNG tanpa pernah memicu
  // SUBSCRIBED maupun CHANNEL_ERROR (bukan reject, cuma diam selamanya).
  // Listener global (mendengarkan telepon masuk di semua percakapan) dan
  // proses menelepon-keluar/menerima sama-sama pakai topik
  // `calls:<conversationId>` yang identik. Sebelum perbaikan ini, listener
  // global sudah subscribe duluan ke topik itu, lalu saat user menekan
  // tombol telepon, startCall mencoba subscribe LAGI ke topik yang sama —
  // menggantung selamanya tanpa exception apa pun, persis gejala
  // "Memanggil…" macet tanpa log error.
  //
  // Solusinya: HANYA ADA SATU channel per conversationId sepanjang hidup
  // komponen ini, disimpan di pool ini. Listener global membuatnya sekali
  // di awal; startCall/acceptCall/rejectCall WAJIB memakai ulang channel
  // yang sama dari pool, tidak pernah membuat channel baru untuk topik
  // yang sudah ada.
  const channelPoolRef = useRef<Map<string, RealtimeChannel>>(new Map());

  const supabase = createClient();

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    setElapsedSec(0);

    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localMediaPromiseRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);

    // PENTING: channel di sini berasal dari channelPoolRef (dipakai
    // bersama listener global), jadi TIDAK boleh di-removeChannel di sini
    // — kalau dihancurkan, listener global kehilangan kemampuannya
    // mendengarkan telepon berikutnya di conversation ini. Cukup lepas
    // referensi lokalnya saja. Pool dibersihkan terpisah lewat cleanup
    // function yang dikembalikan `listenOnConversations`.
    channelRef.current = null;
    conversationIdRef.current = null;
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
    remoteDescSetRef.current = false;
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  function createPeerConnection(selfId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        sendCallSignal(channelRef.current, selfId, {
          type: "ice-candidate",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? null;
      console.log(
        "[call] menerima remote track — kind:", e.track.kind,
        "stream tracks:", stream ? stream.getTracks().map((t) => t.kind) : "tidak ada stream"
      );
      // `ontrack` terpanggil sekali per track (audio & video terpisah),
      // tapi biasanya berasal dari MediaStream yang sama. Kalau kita
      // setState dengan stream setiap kali tanpa cek, video element akan
      // di-assign ulang srcObject-nya berkali-kali walau isinya sama persis
      // — ini yang bikin video terlihat berkedip/reset sesaat setiap kali
      // ada track baru masuk (audio lalu video, dsb). Cukup update state
      // kalau stream-nya benar-benar berbeda (bukan MediaStream yang sama).
      setRemoteStream((prev) => (prev && stream && prev.id === stream.id ? prev : stream));
    };

    pc.onconnectionstatechange = () => {
      console.log("[call] connectionState berubah:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setStatus("connected");
      } else if (pc.connectionState === "failed") {
        setStatus("failed");
        cleanup();
      }
    };

    // Fallback: beberapa browser (terutama WebKit/Safari versi lama) tidak
    // selalu memicu `connectionstatechange` dengan konsisten ke
    // "connected", meski koneksi ICE-nya sendiri sudah settle. Tanpa
    // fallback ini, status bisa macet selamanya di "Menyambungkan…" walau
    // media sebenarnya sudah mengalir normal di kedua sisi.
    pc.oniceconnectionstatechange = () => {
      console.log("[call] iceConnectionState berubah:", pc.iceConnectionState);
      if (
        (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") &&
        statusRef.current !== "connected"
      ) {
        setStatus("connected");
      } else if (pc.iceConnectionState === "failed") {
        setStatus("failed");
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function getLocalMedia(callKind: CallKind) {
    // Kalau sudah ada MediaStream dari panggilan sebelumnya di sesi call
    // yang sama, pakai itu — jangan minta getUserMedia() lagi (itu akan
    // membuka jalur kamera/mic kedua yang terpisah dan tidak perlu).
    if (localStreamRef.current) return localStreamRef.current;

    // Kalau ada request getUserMedia() yang SEDANG berjalan (dipanggil dari
    // tempat lain, mis. acceptCall vs handleSignal offer, hampir
    // bersamaan), tunggu hasil yang SAMA itu — jangan panggil
    // getUserMedia() kedua kalinya yang akan membuat MediaStream berbeda.
    if (localMediaPromiseRef.current) return localMediaPromiseRef.current;

    const promise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callKind === "video" ? { facingMode: "user" } : false,
        });
        console.log(
          "[call] berhasil ambil media lokal —",
          "audio tracks:", stream.getAudioTracks().length,
          "video tracks:", stream.getVideoTracks().length
        );
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        // Penyebab umum: izin kamera/mikrofon ditolak, tidak ada perangkat
        // kamera terdeteksi (NotFoundError), atau halaman tidak diakses lewat
        // HTTPS (getUserMedia butuh secure context, kecuali localhost).
        console.error("[call] gagal ambil media lokal:", err);
        throw err;
      } finally {
        localMediaPromiseRef.current = null;
      }
    })();

    localMediaPromiseRef.current = promise;
    return promise;
  }

  async function processOffer(sdp: RTCSessionDescriptionInit, selfId: string) {
    const pc = pcRef.current ?? createPeerConnection(selfId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSetRef.current = true;
    for (const cand of pendingIceRef.current) await pc.addIceCandidate(cand);
    pendingIceRef.current = [];

    const stream = localStreamRef.current ?? (await getLocalMedia(kindRef.current));
    console.log("[call] addTrack (sisi penerima) — stream id:", stream.id, "tracks:", stream.getTracks().map((t) => t.kind));
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (channelRef.current) {
      sendCallSignal(channelRef.current, selfId, { type: "answer-accept", sdp: answer });
    }
  }

  async function handleSignal(signal: CallSignal, conversationId: string, selfId: string) {
    try {
      await handleSignalInner(signal, conversationId, selfId);
    } catch (err) {
      // handleSignal dipanggil dari callback broadcast tanpa di-await oleh
      // pemanggilnya (channel.on("broadcast", (signal) => void
      // handleSignal(...))) — kalau ada exception di dalamnya (mis.
      // pc.createAnswer()/setLocalDescription() gagal karena state
      // RTCPeerConnection tidak sesuai), sebelumnya itu jadi unhandled
      // promise rejection yang SENYAP TOTAL, tanpa log apa pun. Inilah
      // yang membuat status macet di "Menyambungkan…" tanpa ada petunjuk
      // di console kenapa. Try/catch pembungkus ini memastikan error apa
      // pun di proses sinyal manapun (offer/answer/ice) selalu ter-log.
      console.error("[call] gagal memproses sinyal", signal.type + ":", err);
      if (signal.type === "offer" || signal.type === "answer-accept") {
        setStatus("failed");
        cleanup();
      }
    }
  }

  async function handleSignalInner(signal: CallSignal, conversationId: string, selfId: string) {
    if (signal.type === "ring") {
      console.log("[call] menerima sinyal ring dari", conversationId, "status saat ini:", statusRef.current);
      if (statusRef.current !== "idle") {
        const ch = channelPoolRef.current.get(conversationId);
        if (ch) sendCallSignal(ch, selfId, { type: "busy" });
        return;
      }
      setIncomingCall({ conversationId, kind: signal.kind, from: signal.from });
      setKind(signal.kind);
      setPeerInfo(signal.from);
      setStatus("ringing-incoming");
      return;
    }

    if (signal.type === "busy") {
      setStatus("busy");
      cleanup();
      return;
    }

    if (signal.type === "reject") {
      setStatus("rejected");
      cleanup();
      return;
    }

    if (signal.type === "hangup") {
      setStatus("ended");
      cleanup();
      return;
    }

    if (signal.type === "offer") {
      // KUNCI PERBAIKAN: hanya proses offer SEKARANG kalau user sudah
      // menekan "Terima" (status sudah berpindah ke "connecting" lewat
      // acceptCall()). Kalau belum — status masih "ringing-incoming" atau
      // bahkan "idle" (offer keburu tiba sebelum listener sempat set status
      // ringing) — offer ini DITAHAN dulu di pendingOfferRef. acceptCall()
      // akan memprosesnya begitu user benar-benar menekan "Terima".
      if (statusRef.current !== "connecting") {
        console.log("[call] offer diterima tapi user belum accept (status:", statusRef.current + ") — ditahan dulu");
        pendingOfferRef.current = signal.sdp;
        return;
      }
      await processOffer(signal.sdp, selfId);
      return;
    }

    if (signal.type === "answer-accept") {
      if (ringTimeoutRef.current) {
        clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      remoteDescSetRef.current = true;
      for (const cand of pendingIceRef.current) await pc.addIceCandidate(cand);
      pendingIceRef.current = [];
      return;
    }

    if (signal.type === "ice-candidate") {
      const pc = pcRef.current;
      if (!pc || !remoteDescSetRef.current) {
        pendingIceRef.current.push(signal.candidate);
        return;
      }
      await pc.addIceCandidate(signal.candidate);
      return;
    }
  }

  const getOrCreateChannel = useCallback(
    async (conversationId: string, selfId: string) => {
      const existing = channelPoolRef.current.get(conversationId);
      if (existing) {
        console.log("[call] memakai ulang channel dari pool untuk", conversationId);
        return existing;
      }
      console.log("[call] channel belum ada di pool, membuat baru untuk", conversationId);
      const channel = await joinCallChannel(
        supabase,
        conversationId,
        (signal) => void handleSignal(signal, conversationId, selfId),
        selfId
      );
      channelPoolRef.current.set(conversationId, channel);
      return channel;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase]
  );

  const startCall = useCallback(
    async ({ conversationId, kind: callKind, selfUserId: uid, selfInfo, peerInfo: info }: StartCallOptions) => {
      setKind(callKind);
      setPeerInfo(info);
      setStatus("ringing-outgoing");

      let channel: RealtimeChannel;
      try {
        channel = await getOrCreateChannel(conversationId, uid);
      } catch (err) {
        // joinCallChannel bisa reject kalau WebSocket subscribe gagal
        // (CHANNEL_ERROR/TIMED_OUT) — misalnya RLS menolak join channel-nya
        // sendiri (bukan cuma broadcast-nya), token sesi belum siap, dsb.
        console.error("[call] gagal join channel:", err);
        setStatus("failed");
        cleanup();
        return;
      }

      channelRef.current = channel;
      conversationIdRef.current = conversationId;

      let ringDelivered = false;
      try {
        ringDelivered = await sendCallSignal(channel, uid, {
          type: "ring",
          kind: callKind,
          from: selfInfo,
        });
      } catch (err) {
        console.error("[call] gagal mengirim sinyal ring:", err);
        ringDelivered = false;
      }

      console.log("[call] sinyal ring terkirim:", ringDelivered);

      if (!ringDelivered) {
        // Sinyal "ring" ditolak server (biasanya RLS: bukan partisipan
        // percakapan, atau sesi belum sepenuhnya terautentikasi di socket
        // saat broadcast dikirim).
        setStatus("failed");
        cleanup();
        return;
      }

      // Ring berhasil dikirim, tapi belum tentu ada yang menjawab (offline,
      // tab di-background, dsb). Pasang batas waktu supaya tidak macet.
      ringTimeoutRef.current = setTimeout(() => {
        setStatus("no-answer");
        cleanup();
      }, RING_TIMEOUT_MS);

      try {
        const stream = await getLocalMedia(callKind);
        console.log("[call] addTrack (sisi penelepon) — stream id:", stream.id, "tracks:", stream.getTracks().map((t) => t.kind));
        const pc = createPeerConnection(uid);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendCallSignal(channel, uid, { type: "offer", sdp: offer });
      } catch (err) {
        console.error("[call] gagal menyiapkan media/offer:", err);
        setStatus("failed");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, cleanup, getOrCreateChannel]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const { conversationId, kind: callKind } = incomingCall;
    setStatus("connecting");
    setIncomingCall(null);

    let channel: RealtimeChannel;
    try {
      channel = await getOrCreateChannel(conversationId, selfUserId);
    } catch (err) {
      console.error("[call] gagal join channel saat menerima panggilan:", err);
      setStatus("failed");
      cleanup();
      return;
    }
    channelRef.current = channel;
    conversationIdRef.current = conversationId;

    try {
      await getLocalMedia(callKind);

      // Kalau offer dari penelepon sudah keburu tiba SEBELUM user menekan
      // "Terima" (kasus paling umum, karena penelepon mengirim offer
      // segera setelah ring tanpa menunggu), offer itu sudah ditahan di
      // pendingOfferRef oleh handleSignalInner. Proses sekarang, karena
      // user baru saja benar-benar menerima panggilannya.
      const pendingOffer = pendingOfferRef.current;
      if (pendingOffer) {
        pendingOfferRef.current = null;
        await processOffer(pendingOffer, selfUserId);
      }
    } catch (err) {
      console.error("[call] gagal memproses panggilan setelah diterima:", err);
      setStatus("failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall, selfUserId, supabase, cleanup, getOrCreateChannel]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    const convId = incomingCall.conversationId;
    void (async () => {
      try {
        const channel = await getOrCreateChannel(convId, selfUserId);
        sendCallSignal(channel, selfUserId, { type: "reject" });
      } catch (err) {
        console.error("[call] gagal mengirim sinyal reject:", err);
      }
    })();
    // Kalau ada offer yang sempat tertahan (pendingOfferRef) sebelum user
    // menolak, WAJIB dibersihkan di sini — kalau tidak, offer basi ini bisa
    // salah diproses saat panggilan berikutnya masuk.
    pendingOfferRef.current = null;
    setIncomingCall(null);
    setStatus("idle");
  }, [incomingCall, selfUserId, getOrCreateChannel]);

  const endCall = useCallback(() => {
    if (channelRef.current) {
      sendCallSignal(channelRef.current, selfUserId, { type: "hangup" });
    }
    setStatus("ended");
    cleanup();
  }, [selfUserId, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) {
      console.warn("[call] toggleMute dipanggil tapi localStreamRef masih kosong");
      return;
    }
    const nextMuted = !isMuted;
    const tracks = localStreamRef.current.getAudioTracks();
    console.log("[call] toggle mute:", nextMuted, "— audio tracks yang diubah:", tracks.length, "stream id:", localStreamRef.current.id);
    tracks.forEach((t) => (t.enabled = !nextMuted));
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) {
      console.warn("[call] toggleCamera dipanggil tapi localStreamRef masih kosong");
      return;
    }
    const nextOff = !isCameraOff;
    const tracks = localStreamRef.current.getVideoTracks();
    console.log("[call] toggle kamera:", nextOff, "— video tracks yang diubah:", tracks.length, "stream id:", localStreamRef.current.id);
    tracks.forEach((t) => (t.enabled = !nextOff));
    setIsCameraOff(nextOff);
  }, [isCameraOff]);

  // Listener global: user bisa menerima telepon dari conversation manapun
  // yang dia ikuti. Dipanggil dari komponen provider level-atas. Channel
  // yang dibuat di sini masuk ke channelPoolRef dan akan DIPAKAI ULANG oleh
  // startCall/acceptCall/rejectCall di conversation yang sama — bukan
  // channel terpisah, supaya tidak ada subscribe dobel ke topik yang sama.
  const listenOnConversations = useCallback(
    (conversationIds: string[]) => {
      let cancelled = false;

      console.log("[call] memasang listener untuk conversation:", conversationIds);

      (async () => {
        for (const convId of conversationIds) {
          if (cancelled) break;
          if (channelPoolRef.current.has(convId)) continue;
          try {
            const channel = await joinCallChannel(
              supabase,
              convId,
              (signal) => {
                console.log("[call] menerima sinyal:", signal.type, "dari conversation", convId);
                void handleSignal(signal, convId, selfUserId);
              },
              selfUserId
            );
            console.log("[call] berhasil subscribe ke channel calls:" + convId);
            if (cancelled) {
              supabase.removeChannel(channel);
            } else {
              channelPoolRef.current.set(convId, channel);
            }
          } catch (err) {
            console.error("[call] gagal subscribe ke channel calls:" + convId, err);
            // Channel gagal join (mis. race saat percakapan baru dibuat) —
            // aman diabaikan, listener conversation lain tetap jalan.
          }
        }
      })();

      return () => {
        cancelled = true;
        channelPoolRef.current.forEach((c) => supabase.removeChannel(c));
        channelPoolRef.current.clear();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selfUserId]
  );

  useEffect(() => {
    if (status === "connected") {
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetToIdle = useCallback(() => {
    setStatus("idle");
    setPeerInfo(null);
  }, []);

  return {
    status,
    kind,
    peerInfo,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    elapsedSec,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    listenOnConversations,
    resetToIdle,
  };
}
