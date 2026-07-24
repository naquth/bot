import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin, getReports } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { AdminReportList } from "@/components/admin-report-list";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const reports = await getReports("pending");

  return (
    <div className="mx-auto min-h-screen max-w-[600px] border-x border-[var(--color-border)]">
      <PageHeader title="Panel Admin" backHref="/" />
      <AdminReportList initialReports={reports} />
    </div>
  );
}
