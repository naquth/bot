export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center gap-3 border-b border-[var(--color-border)] px-3">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
        <div className="h-4 w-28 rounded animate-shimmer" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 px-4 py-4">
        <div className="ml-auto h-9 w-40 rounded-2xl animate-shimmer" />
        <div className="h-9 w-52 rounded-2xl animate-shimmer" />
        <div className="ml-auto h-9 w-32 rounded-2xl animate-shimmer" />
      </div>
    </div>
  );
}
