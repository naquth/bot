"use client";

import { X, Plus } from "lucide-react";

export type PollDraft = { options: string[]; durationHours: number };

const DURATIONS = [
  { label: "1 jam", value: 1 },
  { label: "1 hari", value: 24 },
  { label: "3 hari", value: 72 },
  { label: "1 minggu", value: 168 },
];

export function PollEditor({ draft, onChange, onRemove }: { draft: PollDraft; onChange: (d: PollDraft) => void; onRemove: () => void }) {
  function updateOption(index: number, value: string) {
    const next = [...draft.options];
    next[index] = value;
    onChange({ ...draft, options: next });
  }

  function addOption() {
    if (draft.options.length >= 4) return;
    onChange({ ...draft, options: [...draft.options, ""] });
  }

  function removeOption(index: number) {
    if (draft.options.length <= 2) return;
    onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) });
  }

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-white/15 p-3.5">
      <div className="flex flex-col gap-2">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Opsi ${i + 1}`}
              maxLength={80}
              className="flex-1 rounded-[var(--radius-sm)] border border-white/15 bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[14.5px] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/40 focus:outline-none"
            />
            {draft.options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                aria-label="Hapus opsi"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-faint)] active:bg-[var(--color-surface-3)]"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {draft.options.length < 4 && (
        <button
          onClick={addOption}
          className="mt-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-text-dim)] active:text-white"
        >
          <Plus size={15} />
          Tambah opsi
        </button>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
        <select
          value={draft.durationHours}
          onChange={(e) => onChange({ ...draft, durationHours: Number(e.target.value) })}
          className="rounded-[var(--radius-sm)] border border-white/15 bg-[var(--color-surface-2)] px-3 py-1.5 text-[13.5px] text-white focus:outline-none"
        >
          {DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              Berlangsung {d.label}
            </option>
          ))}
        </select>
        <button onClick={onRemove} className="text-[13.5px] font-semibold text-[var(--color-like)] active:opacity-70">
          Hapus poll
        </button>
      </div>
    </div>
  );
}
