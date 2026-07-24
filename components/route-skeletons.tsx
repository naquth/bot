// Kumpulan skeleton yang dipakai bersama oleh file loading.tsx tiap route
// DAN oleh RouteTransitionOverlay (components/route-transition-overlay.tsx).
//
// Alasan ini dipisah dari masing-masing loading.tsx: Next.js hanya memicu
// loading.tsx untuk transisi client-side yang benar-benar suspend, dan itu
// bisa "kalah cepat" oleh prefetch/router-cache atau tidak terpicu sama
// sekali saat render awal/refresh (perilaku ini didokumentasikan resmi oleh
// Next.js — loading.tsx adalah fallback Suspense untuk navigasi, bukan
// jaminan tampilan pada first paint). Supaya animasi loading benar-benar
// konsisten tampil, kita render skeleton yang sama secara manual dari
// overlay client-side yang tidak bergantung pada mekanisme itu.

export function FeedSkeleton() {
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

export function ProfileSkeleton() {
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

export function SimpleListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center border-b border-[var(--color-border)] px-2">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-[var(--color-border)] px-4 py-4">
          <div className="h-10 w-10 shrink-0 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2.5 py-0.5">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <div className="flex h-14 items-center border-b border-[var(--color-border)] px-2">
        <div className="h-9 w-9 rounded-full animate-shimmer" />
      </div>
      <div className="flex gap-3 border-b border-[var(--color-border)] px-4 py-4">
        <div className="h-10 w-10 shrink-0 rounded-full animate-shimmer" />
        <div className="flex-1 space-y-2.5 py-0.5">
          <div className="h-3 w-24 rounded animate-shimmer" />
          <div className="h-3 w-full rounded animate-shimmer" />
          <div className="h-3 w-2/3 rounded animate-shimmer" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-[var(--color-border)] px-4 py-3.5 pl-10">
          <div className="h-8 w-8 shrink-0 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3 w-20 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Menentukan skeleton mana yang cocok untuk sebuah path. Dipakai baik untuk
// overlay transisi maupun (secara konseptual) mencerminkan loading.tsx yang
// sudah ada di tiap folder route.
export function skeletonForPath(path: string): React.ReactNode {
  if (path === "/" || path === "") return <FeedSkeleton />;
  if (path.startsWith("/profil")) return <ProfileSkeleton />;
  if (path.startsWith("/pesan/") && path !== "/pesan") return <ThreadSkeleton />;
  if (path.startsWith("/utas/")) return <ThreadSkeleton />;
  if (
    path.startsWith("/pesan") ||
    path.startsWith("/aktivitas") ||
    path.startsWith("/tersimpan") ||
    path.startsWith("/cari")
  )
    return <SimpleListSkeleton />;
  return <FeedSkeleton />;
}
