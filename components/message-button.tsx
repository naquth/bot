"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { getOrCreateConversation } from "@/app/actions";
import { useToast } from "@/components/toast";

export function MessageButton({ targetUserId, isLoggedIn }: { targetUserId: string; isLoggedIn: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/masuk");
      return;
    }
    startTransition(async () => {
      const res = await getOrCreateConversation(targetUserId);
      if (res.ok) {
        router.push(`/pesan/${res.id}`);
      } else {
        showToast(res.error ?? "Gagal memulai percakapan", "error");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-label="Kirim pesan"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] transition-colors active:bg-[var(--color-surface-3)] disabled:opacity-50"
    >
      <Mail size={18} strokeWidth={2} className="text-white" />
    </button>
  );
}
