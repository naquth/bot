"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-white/[0.14] px-4 py-3.5 text-[14.5px] font-bold text-[var(--color-like)] transition-colors active:bg-[var(--color-like)]/10 disabled:opacity-50"
    >
      <LogOut size={17} strokeWidth={2} />
      {isPending ? "Keluar…" : "Keluar akun"}
    </button>
  );
}
