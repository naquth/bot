"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportUserData } from "@/app/actions";
import { useToast } from "@/components/toast";

export function ExportDataButton() {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleExport() {
    startTransition(async () => {
      const res = await exportUserData();
      if (!res.ok) {
        showToast(res.error ?? "Gagal mengekspor data", "error");
        return;
      }

      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `utas-data-${res.data.profile?.username ?? "export"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(true);
      showToast("Data berhasil diunduh");
      setTimeout(() => setDone(false), 2000);
    });
  }

  return (
    <button
      onClick={handleExport}
      disabled={isPending}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-4 py-3.5 text-[14.5px] font-bold text-white transition-colors active:bg-white/[0.04] disabled:opacity-50"
    >
      <Download size={17} strokeWidth={2} />
      {isPending ? "Menyiapkan…" : done ? "Terunduh" : "Unduh data saya"}
    </button>
  );
}
