"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Send, Image as ImageIcon, X, Users, Phone, Video } from "lucide-react";
import { sendMessage, markMessagesRead, deleteMessage } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnread } from "@/components/unread-provider";
import { useCall } from "@/components/call-provider";
import { useToast } from "@/components/toast";
import { resizePostImage } from "@/lib/resize-image";
import { ImageLightbox } from "@/components/image-lightbox";
import { VoiceRecorder, type PendingVoiceNote } from "@/components/voice-recorder";
import { VoiceMessageBubble } from "@/components/voice-message-bubble";

type Message = {
  id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  audio_url?: string | null;
  audio_duration_sec?: number | null;
  created_at: string;
};

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type PendingImage = { previewUrl: string; storageUrl: string; width: number; height: number };

export function ChatThread({
  conversationId,
  currentUserId,
  isGroup,
  groupName,
  groupAvatarUrl,
  otherUser,
  members,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatarUrl: string | null;
  otherUser: Member | null;
  members: Member[];
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [isPending, startTransition] = useTransition();
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { refreshUnreadMessages } = useUnread();
  const { showToast } = useToast();
  const { startCall } = useCall();

  const membersById = new Map(members.map((m) => [m.id, m]));
  const headerTitle = isGroup ? (groupName ?? "Grup") : (otherUser?.display_name ?? "Pengguna");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  useEffect(() => {
    markMessagesRead(conversationId).then(() => refreshUnreadMessages());
  }, [conversationId, refreshUnreadMessages]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          if (newMsg.sender_id !== currentUserId) {
            markMessagesRead(conversationId).then(() => refreshUnreadMessages());
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, refreshUnreadMessages]);

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("File harus berupa gambar.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Ukuran gambar maksimal 8MB.", "error");
      return;
    }

    setUploadingImage(true);
    try {
      const resized = await resizePostImage(file);
      const previewUrl = URL.createObjectURL(resized.blob);

      const supabase = createClient();
      const path = `${currentUserId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("post-images")
        .upload(path, resized.blob, { contentType: "image/jpeg" });

      if (error) {
        showToast("Gagal mengunggah gambar.", "error");
        setUploadingImage(false);
        return;
      }

      const { data } = supabase.storage.from("post-images").getPublicUrl(path);
      setPendingImage({ previewUrl, storageUrl: data.publicUrl, width: resized.width, height: resized.height });
    } catch {
      showToast("Gagal memproses gambar.", "error");
    } finally {
      setUploadingImage(false);
    }
  }

  function handleSend() {
    const trimmed = content.trim();
    console.log("[voice-note] handleSend dipanggil — pendingVoiceNote:", pendingVoiceNote, "isPending:", isPending);
    if ((!trimmed && !pendingImage && !pendingVoiceNote) || isPending) {
      console.warn("[voice-note] handleSend dibatalkan lebih awal (tidak ada konten/gambar/voice note, atau isPending true)");
      return;
    }
    setContent("");
    const image = pendingImage;
    const voiceNote = pendingVoiceNote;
    setPendingImage(null);
    setPendingVoiceNote(null);
    startTransition(async () => {
      const result = await sendMessage(
        conversationId,
        trimmed,
        image ? { url: image.storageUrl, width: image.width, height: image.height } : undefined,
        voiceNote ? { url: voiceNote.path, durationSec: voiceNote.durationSec } : undefined
      );
      // Sebelumnya hasil sendMessage tidak pernah dicek sama sekali — kalau
      // gagal (mis. RLS menolak, atau kolom tidak valid), pesan (termasuk
      // voice note) hilang begitu saja dari UI tanpa pemberitahuan apa pun
      // ke user, dan tidak pernah benar-benar tersimpan di database.
      console.log("[voice-note] hasil sendMessage:", result);
      if (!result.ok) {
        showToast(result.error, "error");
      }
    });
  }

  function confirmDeleteMessage() {
    if (!messageToDelete) return;
    const id = messageToDelete;
    setMessageToDelete(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMessage(id, conversationId);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-[56px] shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-black/85 px-2 backdrop-blur-xl backdrop-saturate-150">
        <Link
          href="/pesan"
          aria-label="Kembali"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>

        {isGroup ? (
          <Link href={`/pesan/${conversationId}/info`} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
            {groupAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={groupAvatarUrl} alt={headerTitle} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/[0.08]" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-3)] ring-1 ring-white/[0.08]">
                <Users size={16} strokeWidth={1.75} className="text-[var(--color-text-dim)]" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-white">{headerTitle}</p>
              <p className="truncate text-[12px] text-[var(--color-text-faint)]">{members.length + 1} anggota</p>
            </div>
          </Link>
        ) : (
          <>
            <Link href={otherUser ? `/profil/${otherUser.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
              {otherUser && (
                <Avatar username={otherUser.username} displayName={otherUser.display_name} avatarUrl={otherUser.avatar_url} size="sm" />
              )}
              <p className="truncate text-[15px] font-bold text-white">{headerTitle}</p>
            </Link>
            {otherUser && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() =>
                    startCall(conversationId, "audio", {
                      id: otherUser.id,
                      username: otherUser.username,
                      displayName: otherUser.display_name,
                      avatarUrl: otherUser.avatar_url,
                    })
                  }
                  aria-label="Telepon"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
                >
                  <Phone size={19} strokeWidth={2} />
                </button>
                <button
                  onClick={() =>
                    startCall(conversationId, "video", {
                      id: otherUser.id,
                      username: otherUser.username,
                      displayName: otherUser.display_name,
                      avatarUrl: otherUser.avatar_url,
                    })
                  }
                  aria-label="Video call"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
                >
                  <Video size={20} strokeWidth={2} />
                </button>
              </div>
            )}
          </>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            {isGroup ? (
              groupAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={groupAvatarUrl} alt={headerTitle} className="h-[76px] w-[76px] rounded-full object-cover ring-1 ring-white/[0.08]" />
              ) : (
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[var(--color-surface-3)] ring-1 ring-white/[0.08]">
                  <Users size={30} strokeWidth={1.5} className="text-[var(--color-text-dim)]" />
                </div>
              )
            ) : (
              otherUser && <Avatar username={otherUser.username} displayName={otherUser.display_name} avatarUrl={otherUser.avatar_url} size="lg" />
            )}
            <p className="mt-3 font-display text-[16px] font-semibold text-white">{headerTitle}</p>
            {!isGroup && otherUser && <p className="mt-1 text-[13.5px] text-[var(--color-text-dim)]">@{otherUser.username}</p>}
            <p className="mt-4 text-[13.5px] text-[var(--color-text-faint)]">Mulai percakapan kalian.</p>
          </div>
        )}

        {messages.map((m, i) => {
          const isMe = m.sender_id === currentUserId;
          const prevSameSender = i > 0 && messages[i - 1].sender_id === m.sender_id;
          const sender = isGroup ? membersById.get(m.sender_id) : undefined;

          return (
            <div
              key={m.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"} ${prevSameSender ? "mt-0.5" : "mt-2.5"} ${isGroup && !isMe ? "gap-2" : ""}`}
            >
              {isGroup && !isMe && (
                <div className="w-7 shrink-0">
                  {!prevSameSender && sender && (
                    <Avatar username={sender.username} displayName={sender.display_name} avatarUrl={sender.avatar_url} size="sm" />
                  )}
                </div>
              )}
              <div className="max-w-[75%]">
                {isGroup && !isMe && !prevSameSender && sender && (
                  <p className="mb-0.5 ml-1 text-[12.5px] font-semibold text-[var(--color-text-dim)]">{sender.display_name}</p>
                )}
                {m.audio_url && (
                  <div className={m.content ? "mb-1" : ""}>
                    <VoiceMessageBubble
                      audioPath={m.audio_url}
                      durationSec={m.audio_duration_sec ?? 0}
                      isMe={isMe}
                    />
                  </div>
                )}
                {m.image_url && (
                  <button
                    onClick={() => setLightboxSrc(m.image_url!)}
                    className={`block overflow-hidden ${m.content ? "mb-1" : ""} ${
                      isMe ? "rounded-[20px] rounded-br-[6px]" : "rounded-[20px] rounded-bl-[6px]"
                    } border border-white/10`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.image_url}
                      alt=""
                      loading="lazy"
                      className="max-h-72 w-full object-cover"
                      style={m.image_width && m.image_height ? { aspectRatio: `${m.image_width} / ${m.image_height}` } : undefined}
                    />
                  </button>
                )}
                {m.content && (
                  <button
                    onClick={() => isMe && setMessageToDelete(m.id)}
                    className={`w-full whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-left text-[15px] leading-[1.42] transition-opacity ${
                      isMe
                        ? "rounded-br-[6px] bg-white text-black active:opacity-70"
                        : "rounded-bl-[6px] bg-[var(--color-surface-2)] text-white"
                    }`}
                  >
                    {m.content}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="relative mx-3.5 mb-2 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.previewUrl} alt="" className="h-20 w-20 rounded-[var(--radius-sm)] object-cover" />
          <button
            onClick={() => setPendingImage(null)}
            aria-label="Hapus gambar"
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black text-white ring-2 ring-black"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {pendingVoiceNote && (
        <div className="mx-3.5 mb-2 flex items-center gap-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5">
          <audio src={pendingVoiceNote.previewUrl} controls className="h-9 flex-1" />
          <button
            onClick={() => setPendingVoiceNote(null)}
            aria-label="Hapus voice note"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-white"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-[var(--color-border)] px-3.5 py-3.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage || !!pendingVoiceNote}
          aria-label="Lampirkan gambar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)] disabled:opacity-30"
        >
          {uploadingImage ? (
            <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <ImageIcon size={20} strokeWidth={2} />
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickImage} className="hidden" />

        {pendingVoiceNote ? (
          <div className="flex h-11 flex-1 items-center rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 text-[13.5px] text-[var(--color-text-dim)]">
            Voice note siap dikirim
          </div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ketik pesan…"
              rows={1}
              maxLength={1000}
              className="max-h-28 flex-1 resize-none rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[15px] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/30 focus:outline-none"
            />
            {!content.trim() && !pendingImage && (
              <VoiceRecorder
                userId={currentUserId}
                conversationId={conversationId}
                onRecorded={setPendingVoiceNote}
                onError={(m) => showToast(m, "error")}
              />
            )}
          </>
        )}

        <button
          onClick={handleSend}
          disabled={(!content.trim() && !pendingImage && !pendingVoiceNote) || isPending}
          aria-label="Kirim pesan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white transition-all active:scale-90 disabled:opacity-30"
        >
          <Send size={18} strokeWidth={2.25} className="text-black" />
        </button>
      </div>

      <ConfirmDialog
        open={messageToDelete !== null}
        title="Hapus pesan ini?"
        description={isGroup ? "Pesan akan dihapus untuk semua anggota grup dan tidak dapat dikembalikan." : "Pesan akan dihapus untuk kalian berdua dan tidak dapat dikembalikan."}
        confirmLabel="Hapus"
        destructive
        onConfirm={confirmDeleteMessage}
        onCancel={() => setMessageToDelete(null)}
      />

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
