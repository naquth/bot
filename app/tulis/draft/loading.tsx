export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-[56px] items-center border-b border-[var(--color-border)] px-2">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
        <div className="mx-auto h-4 w-16 rounded animate-shimmer" />
        <div className="h-9 w-9" />
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="h-3 w-20 rounded animate-shimmer" />
            <div className="h-4 w-3/4 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
