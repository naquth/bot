import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { GroupCreator } from "@/components/group-creator";

export default async function GrupBaruPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)]">
      <PageHeader title="Grup Baru" backHref="/pesan" />
      <GroupCreator currentUserId={user.id} />
    </div>
  );
}
