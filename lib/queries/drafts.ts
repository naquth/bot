import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostDraft } from "@/lib/types";

const DRAFT_SELECT =
  "id, author_id, content, image_url, image_width, image_height, video_url, video_width, video_height, video_duration_sec, video_thumbnail_url, poll_options, poll_duration_hours, visibility, parent_id, quote_post_id, created_at, updated_at";

export async function getDrafts(supabase: SupabaseClient, userId: string): Promise<PostDraft[]> {
  const { data, error } = await supabase
    .from("post_drafts")
    .select(DRAFT_SELECT)
    .eq("author_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data as unknown as PostDraft[];
}

export async function getDraftById(
  supabase: SupabaseClient,
  userId: string,
  draftId: string
): Promise<PostDraft | null> {
  const { data, error } = await supabase
    .from("post_drafts")
    .select(DRAFT_SELECT)
    .eq("author_id", userId)
    .eq("id", draftId)
    .single();

  if (error || !data) return null;
  return data as unknown as PostDraft;
}
