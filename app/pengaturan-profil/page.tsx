import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { LogoutButton } from "@/components/logout-button";
import { ExportDataButton } from "@/components/export-data-button";
import { DeleteAccountButton } from "@/components/delete-account-button";

export default async function PengaturanProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/masuk");

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <PageHeader title="Edit profil" backHref={`/profil/${profile.username}`} />
      <ProfileEditForm profile={profile} />
      <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
        {profile.is_admin && (
          <Link
            href="/admin"
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-4 py-3.5 text-[14.5px] font-bold text-[#4A9EFF] transition-colors active:bg-white/[0.04]"
          >
            <ShieldAlert size={17} strokeWidth={2} />
            Panel Admin
          </Link>
        )}
        <ExportDataButton />
        <p className="px-4 text-[12.5px] leading-relaxed text-[var(--color-text-faint)]">
          Berkas berisi profil, utas, suka, bookmark, dan daftar follow. Isi pesan langsung (DM) tidak disertakan
          untuk menjaga privasi lawan bicaramu.
        </p>
        <LogoutButton />
        <DeleteAccountButton />
      </div>
    </div>
  );
}
