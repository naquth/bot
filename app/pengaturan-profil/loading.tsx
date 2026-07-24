export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center justify-center border-b border-[var(--color-border)]">
        <div className="h-4 w-24 rounded animate-shimmer" />
      </div>
      <div className="px-4 py-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full animate-shimmer" />
          <div className="h-8 w-24 rounded-full animate-shimmer" />
        </div>
        <div className="mt-6 space-y-4">
          <div className="h-12 w-full rounded-xl animate-shimmer" />
          <div className="h-20 w-full rounded-xl animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
