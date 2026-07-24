import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return <BadgeCheck size={size} className="shrink-0 fill-[#4A9EFF] text-black" strokeWidth={2.5} />;
}
