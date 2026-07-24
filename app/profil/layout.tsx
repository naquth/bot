export default function ProfilLayout({ children }: { children: React.ReactNode }) {
  // Layout kosong ini sengaja ada supaya /profil/* punya boundary segmen
  // sendiri. Tanpa ini, saat navigasi dari "/" ke "/profil/[username]",
  // Next.js sempat menampilkan app/loading.tsx (skeleton feed) dulu sebelum
  // app/profil/[username]/loading.tsx (skeleton profil) muncul, karena
  // resolusi segmen anak belum "diklaim" oleh percabangan /profil sendiri.
  // Dengan layout ini, /profil/[username]/loading.tsx langsung jadi
  // fallback yang dipakai — tidak ada lagi flash skeleton feed di antaranya.
  return children;
}
