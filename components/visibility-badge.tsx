import { visibilityMeta } from "@/components/visibility-picker";
import type { PostVisibility } from "@/lib/types";

export function VisibilityBadge({ visibility, size = 13 }: { visibility: PostVisibility; size?: number }) {
  const meta = visibilityMeta(visibility);
  const Icon = meta.icon;
  return (
    <span
      className="flex shrink-0 items-center text-[var(--color-text-faint)]"
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
