import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDraftById } from "@/lib/queries/drafts";
import { FullComposer } from "@/components/full-composer";

export default async function TulisPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/masuk");

  const initialDraft = draftId ? await getDraftById(supabase, user.id, draftId) : null;

  return (
    <FullComposer
      authorId={profile.id}
      authorUsername={profile.username}
      authorDisplayName={profile.display_name}
      authorAvatarUrl={profile.avatar_url}
      initialDraft={initialDraft}
    />
  );
}
