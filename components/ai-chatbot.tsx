"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Sparkles, Send, RotateCw } from "lucide-react";
import { askChatbot, type ChatbotTurn } from "@/app/ai-actions";
import { Avatar } from "@/components/avatar";

type Msg = ChatbotTurn & { id: number };

const SUGGESTIONS = [
  "Kasih ide topik utas hari ini",
  "Bantu aku bikin bio profil yang menarik",
  "Jelaskan cara kerja fitur poll di Utas",
];

export function AiChatbot({
  myUsername,
  myDisplayName,
  myAvatarUrl,
}: {
  myUsername: string;
  myDisplayName: string;
  myAvatarUrl?: string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setError(null);
    const userMsg: Msg = { id: idRef.current++, role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    startTransition(async () => {
      const res = await askChatbot(nextMessages.map(({ role, content }) => ({ role, content })));
      if (res.ok) {
        setMessages((prev) => [...prev, { id: idRef.current++, role: "assistant", content: res.data }]);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <Sparkles size={24} strokeWidth={2} className="text-white" />
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold tracking-[-0.01em]">Asisten Utas</h2>
              <p className="mt-1 text-[13.5px] text-[var(--color-text-dim)]">
                Tanya apa saja, minta ide post, atau sekadar mengobrol.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3.5 py-3 text-left text-[13.5px] text-white transition-colors active:bg-white/[0.06]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end gap-2.5">
                  <div className="max-w-[80%] rounded-[var(--radius-md)] rounded-tr-[6px] bg-white px-3.5 py-2.5 text-[14.5px] leading-[1.45] text-black">
                    {m.content}
                  </div>
                  <Avatar username={myUsername} displayName={myDisplayName} avatarUrl={myAvatarUrl} size="sm" />
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Sparkles size={13} strokeWidth={2.25} className="text-white" />
                  </div>
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-[var(--radius-md)] rounded-tl-[6px] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[14.5px] leading-[1.45] text-white">
                    {m.content}
                  </div>
                </div>
              )
            )}
            {isPending && (
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Sparkles size={13} strokeWidth={2.25} className="text-white" />
                </div>
                <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] rounded-tl-[6px] bg-[var(--color-surface-2)] px-3.5 py-3">
                  <RotateCw size={14} className="animate-spin text-[var(--color-text-dim)]" strokeWidth={2.25} />
                </div>
              </div>
            )}
            {error && <p className="text-center text-[13px] text-[var(--color-like)]">{error}</p>}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-black/85 px-3 py-3 backdrop-blur-xl backdrop-saturate-150">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Tanya sesuatu…"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[14.5px] leading-[1.4] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            aria-label="Kirim"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all active:scale-90 disabled:opacity-30"
          >
            <Send size={17} strokeWidth={2.25} />
          </button>
        </form>
      </div>
    </div>
  );
}
