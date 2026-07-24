export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center justify-center border-b border-[var(--color-border)]">
        <div className="h-4 w-16 rounded animate-shimmer" />
      </div>
      <div className="px-4 py-3">
        <div className="h-11 w-full rounded-xl animate-shimmer" />
      </div>
    </div>
  );
}
