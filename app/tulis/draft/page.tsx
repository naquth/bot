import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDrafts } from "@/lib/queries/drafts";
import { PageHeader } from "@/components/page-header";
import { DraftList } from "@/components/draft-list";

export default async function DraftListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const drafts = await getDrafts(supabase, user.id);

  // Sebelumnya backHref di sini selalu di-hardcode "/tulis", jadi kalau
  // halaman ini dibuka dari /profil (lewat tombol Draft), tombol kembali
  // malah membawa user ke /tulis (komposer kosong) alih-alih balik ke
  // /profil tempat dia menekan tombolnya. Sekarang halaman yang membuka
  // link ke sini bisa menitipkan asalnya lewat ?from=..., dan itu yang
  // dipakai sebagai tujuan tombol kembali. Hanya path relatif ("/...") yang
  // diterima, supaya tidak bisa dipakai untuk open-redirect ke domain lain.
  const backHref = from && from.startsWith("/") && !from.startsWith("//") ? from : "/tulis";

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Draft" backHref={backHref} />

      {drafts.length === 0 ? (
        <div className="px-4 py-24 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <FileText size={26} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
          </div>
          <p className="mt-5 font-display text-[18px] font-bold tracking-[-0.01em] text-white">
            Belum ada draft
          </p>
          <p className="mt-1.5 text-[14.5px] text-[var(--color-text-dim)]">
            Utas yang belum kamu kirim akan tersimpan di sini secara otomatis.
          </p>
        </div>
      ) : (
        <DraftList drafts={drafts} />
      )}
    </div>
  );
}
