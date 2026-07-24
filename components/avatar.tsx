type AvatarProps = {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "list";
};

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[13px]",
  list: "h-12 w-12 text-[14px]",
  lg: "h-[76px] w-[76px] text-[22px]",
  xl: "h-24 w-24 text-[28px]",
};

export function Avatar({ displayName, avatarUrl, size = "md" }: AvatarProps) {
  const initials = displayName.slice(0, 2).toUpperCase();
  const dims = SIZES[size];

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${dims} shrink-0 rounded-full object-cover ring-1 ring-white/[0.08]`}
      />
    );
  }

  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-3)] font-display font-bold text-white ring-1 ring-white/[0.08]`}
    >
      {initials}
    </div>
  );
}
