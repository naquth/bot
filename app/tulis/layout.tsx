export default function TulisLayout({ children }: { children: React.ReactNode }) {
  // Sama seperti app/profil/layout.tsx: mencegah app/tulis/loading.tsx
  // sempat tampil dulu sebelum app/tulis/draft/loading.tsx.
  return children;
}
