export default function PesanLayout({ children }: { children: React.ReactNode }) {
  // Sama seperti app/profil/layout.tsx: mencegah app/pesan/loading.tsx
  // sempat tampil dulu sebelum app/pesan/[id]/loading.tsx saat berpindah
  // ke sebuah percakapan.
  return children;
}
