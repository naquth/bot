"use client";

import { Globe, Users, Lock, Check } from "lucide-react";
import type { PostVisibility } from "@/lib/types";

export const VISIBILITY_OPTIONS: {
  value: PostVisibility;
  label: string;
  description: string;
  icon: typeof Globe;
}[] = [
  {
    value: "public",
    label: "Semua orang",
    description: "Siapa saja di Utas bisa melihat postingan ini",
    icon: Globe,
  },
  {
    value: "followers",
    label: "Pengikut",
    description: "Hanya orang yang mengikutimu yang bisa melihat",
    icon: Users,
  },
  {
    value: "private",
    label: "Hanya saya",
    description: "Cuma kamu yang bisa melihat postingan ini",
    icon: Lock,
  },
];

export function visibilityMeta(value: PostVisibility) {
  return VISIBILITY_OPTIONS.find((o) => o.value === value) ?? VISIBILITY_OPTIONS[0];
}

export function VisibilityPicker({
  open,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: PostVisibility;
  onSelect: (v: PostVisibility) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-[420px] rounded-t-[28px] border border-white/10 bg-[#0A0A0B] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:rounded-[28px] sm:pb-5"
      >
        <h2 className="font-display text-[17.5px] font-bold tracking-[-0.01em] text-white">
          Siapa yang bisa melihat?
        </h2>
        <p className="mt-1.5 text-[14px] text-[var(--color-text-dim)]">
          Pilih siapa yang boleh melihat postingan ini.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          {VISIBILITY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className={`flex items-center gap-3.5 rounded-[var(--radius-md)] border px-3.5 py-3.5 text-left transition-colors ${
                  selected
                    ? "border-white bg-white/[0.06]"
                    : "border-white/10 active:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    selected ? "bg-white text-black" : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-white">{opt.label}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-text-dim)]">{opt.description}</p>
                </div>
                {selected && <Check size={18} strokeWidth={2.5} className="shrink-0 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
