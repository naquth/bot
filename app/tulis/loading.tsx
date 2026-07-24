export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center justify-between px-3">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
        <div className="h-8 w-16 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}
