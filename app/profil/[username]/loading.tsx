export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center border-b border-[var(--color-border)] px-2">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
      </div>
      <div className="px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded animate-shimmer" />
            <div className="h-3 w-20 rounded animate-shimmer" />
          </div>
          <div className="h-16 w-16 shrink-0 rounded-full animate-shimmer" />
        </div>
        <div className="mt-4 h-3 w-24 rounded animate-shimmer" />
      </div>
      <div className="border-b border-t border-[var(--color-border)] px-4 py-2.5">
        <div className="h-3 w-10 rounded animate-shimmer" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5">
          <div className="h-9 w-9 shrink-0 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
