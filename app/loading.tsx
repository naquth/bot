export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="h-[56px] border-b border-[var(--color-border)]" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-[var(--color-border)] px-4 py-4">
          <div className="h-10 w-10 shrink-0 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2.5 py-0.5">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-2/3 rounded animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
