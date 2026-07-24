import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BottomNav } from "@/components/bottom-nav";
import { AiChatbot } from "@/components/ai-chatbot";

export default async function AsistenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto flex min-h-screen max-w-[600px] flex-col border-x border-[var(--color-border)] pb-24">
      <PageHeader title="Asisten AI" />
      <AiChatbot
        myUsername={profile?.username ?? "user"}
        myDisplayName={profile?.display_name ?? "Kamu"}
        myAvatarUrl={profile?.avatar_url}
      />
      <BottomNav />
    </div>
  );
}
