import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// SINYAL PANGGILAN (WebRTC signaling lewat Supabase Realtime Broadcast)
// ============================================================
//
// Kenapa broadcast, bukan tabel database? Sinyal panggilan (offer/answer/
// ICE candidate/dering/tutup) bersifat sekali pakai dan sangat sering —
// menyimpannya ke Postgres cuma menambah beban tanpa guna, karena begitu
// panggilan selesai sinyalnya tidak berarti apa-apa lagi. Broadcast Supabase
// Realtime pas untuk kasus ini: cepat, tidak perlu disimpan.
//
// Channel-nya bertopik `calls:<conversation_id>` dan diproteksi Realtime
// Authorization (lihat migration add-call-signaling-rls.sql) — hanya
// partisipan percakapan itu yang bisa join & broadcast ke sana.

export type CallSignal =
  | { type: "ring"; from: CallerInfo; kind: "audio" | "video" }
  | { type: "answer-accept"; sdp: RTCSessionDescriptionInit }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit }
  | { type: "reject" }
  | { type: "hangup" }
  | { type: "busy" };

export type CallerInfo = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

const EVENT_NAME = "call-signal";

export async function joinCallChannel(
  supabase: SupabaseClient,
  conversationId: string,
  onSignal: (signal: CallSignal, senderId: string) => void,
  selfUserId: string
): Promise<RealtimeChannel> {
  // Token sesi harus diikutkan supaya kebijakan RLS realtime.messages bisa
  // mengevaluasi auth.uid() dengan benar untuk channel private ini.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }

  const channel = supabase.channel(`calls:${conversationId}`, {
    config: { private: true, broadcast: { self: false, ack: true } },
  });

  channel.on("broadcast", { event: EVENT_NAME }, (payload) => {
    const body = payload.payload as { signal: CallSignal; senderId: string };
    if (body.senderId === selfUserId) return;
    onSignal(body.signal, body.senderId);
  });

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
    });
  });

  return channel;
}

export async function sendCallSignal(
  channel: RealtimeChannel,
  senderId: string,
  signal: CallSignal
): Promise<boolean> {
  const result = await channel.send({
    type: "broadcast",
    event: EVENT_NAME,
    payload: { senderId, signal },
  });
  // Dengan `ack: true` di config channel, `send()` sekarang menunggu
  // konfirmasi server sebelum resolve. Kalau ditolak (mis. RLS insert ke
  // realtime.messages gagal, biasanya karena auth.uid() null atau bukan
  // partisipan percakapan), hasilnya bukan "ok" — sebelumnya ini gagal
  // secara senyap dan pemanggil tidak pernah tahu sinyalnya tidak sampai.
  return result === "ok";
}

// STUN publik (gratis, dari Google) cukup untuk kebanyakan koneksi P2P di
// jaringan rumahan/kantor biasa. Untuk keandalan penuh di jaringan dengan
// NAT simetris atau firewall ketat (banyak dijumpai di jaringan korporat),
// dibutuhkan TURN server relay tambahan (mis. Twilio Network Traversal,
// Cloudflare Calls, atau metered.ca) — ini di luar cakupan gratis STUN dan
// perlu kredensial berbayar terpisah untuk skala produksi.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
