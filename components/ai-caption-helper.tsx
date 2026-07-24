"use client";

import { useState, useTransition } from "react";
import { Sparkles, X, RotateCw } from "lucide-react";
import { generateCaptionSuggestions, type CaptionTone } from "@/app/ai-actions";

const TONES: { value: CaptionTone; label: string }[] = [
  { value: "santai", label: "Santai" },
  { value: "profesional", label: "Profesional" },
  { value: "lucu", label: "Lucu" },
  { value: "menarik", label: "Menarik" },
];

export function AiCaptionHelper({
  currentContent,
  onPick,
  onClose,
}: {
  currentContent: string;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState(currentContent);
  const [tone, setTone] = useState<CaptionTone>("santai");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateCaptionSuggestions(topic, tone);
      if (res.ok) {
        setSuggestions(res.data);
      } else {
        setSuggestions([]);
        setError(res.error);
      }
    });
  }

  return (
    <div className="animate-slide-down mt-3 rounded-[var(--radius-md)] border border-white/15 bg-[var(--color-surface-2)] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-white">
          <Sparkles size={15} strokeWidth={2.25} />
          Bantuan caption AI
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors active:bg-[var(--color-surface-3)]"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topik atau draf kasar... mis. 'promo diskon toko kopi weekend ini'"
        rows={2}
        className="mt-2.5 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-black/30 p-2.5 text-[14px] leading-[1.45] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 focus:outline-none"
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {TONES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTone(t.value)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              tone === t.value
                ? "bg-white text-black"
                : "bg-[var(--color-surface-3)] text-[var(--color-text-dim)] active:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={isPending || !topic.trim()}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2.5 text-[13.5px] font-bold text-black transition-all active:scale-[0.98] disabled:opacity-30"
      >
        {isPending ? (
          <RotateCw size={15} className="animate-spin" strokeWidth={2.5} />
        ) : (
          <Sparkles size={15} strokeWidth={2.5} />
        )}
        {suggestions.length > 0 ? "Buat ulang" : "Buatkan caption"}
      </button>

      {error && <p className="mt-2 text-[13px] text-[var(--color-like)]">{error}</p>}

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2.5 text-left text-[13.5px] leading-[1.45] text-white transition-colors active:bg-white/[0.06]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
