"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-4 py-3.5 text-[14.5px] font-bold text-[var(--color-text-faint)] transition-colors active:bg-white/[0.04] active:text-[var(--color-like)]"
      >
        <Trash2 size={17} strokeWidth={2} />
        Hapus akun
      </button>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
