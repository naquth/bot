"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clapperboard, Plus, Heart, MessageCircle } from "lucide-react";
import { useUnread } from "@/components/unread-provider";

const items = [
  { href: "/", icon: Home, label: "Beranda" },
  { href: "/reels", icon: Clapperboard, label: "Reels" },
  { href: "/tulis", icon: Plus, label: "Tulis", isCompose: true },
  { href: "/aktivitas", icon: Heart, label: "Aktivitas" },
  { href: "/pesan", icon: MessageCircle, label: "Pesan" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { unreadNotifications, unreadMessages } = useUnread();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-black/85 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-[600px] items-center justify-between px-5 py-2.5">
        {items.map(({ href, icon: Icon, label, isCompose }) => {
          const active = isActive(href);

          if (isCompose) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="flex h-12 w-[72px] items-center justify-center rounded-[var(--radius-lg)] bg-white transition-transform duration-200 active:scale-90"
                style={{ transitionTimingFunction: "var(--ease-spring)" }}
              >
                <Icon size={24} strokeWidth={2.5} className="text-black" />
              </Link>
            );
          }

          const badgeCount = label === "Aktivitas" ? unreadNotifications : label === "Pesan" ? unreadMessages : 0;
          const showBadge = badgeCount > 0;

          return (
            <Link
              key={href}
              href={href}
              aria-label={showBadge ? `${label}, ${badgeCount} belum dibaca` : label}
              aria-current={active ? "page" : undefined}
              className="relative flex h-12 w-[72px] items-center justify-center rounded-[var(--radius-lg)] transition-all duration-150 active:scale-90 active:bg-white/[0.06]"
            >
              <Icon
                size={25}
                strokeWidth={active ? 2.5 : 1.75}
                fill={active && label === "Aktivitas" ? "var(--color-like)" : active && label === "Pesan" ? "white" : "none"}
                className={
                  active
                    ? label === "Aktivitas"
                      ? "text-[var(--color-like)]"
                      : "text-white"
                    : "text-[var(--color-text-faint)]"
                }
              />
              {showBadge && (
                <span className="absolute right-4 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-like)] px-1 text-[10px] font-bold text-white ring-2 ring-black">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}
