import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/masuk");

  const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();

  if (!data) redirect("/masuk");
  redirect(`/profil/${data.username}`);
}
