import type { SupabaseClient } from "@supabase/supabase-js";
import type { Story, StoryGroup, Profile } from "@/lib/types";

const STORY_SELECT =
  "id, author_id, image_url, image_width, image_height, video_url, video_width, video_height, video_duration_sec, caption, bg_color, view_count, created_at, expires_at";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ambil semua story aktif (belum kedaluwarsa) dari orang yang di-follow user
 * plus story milik user sendiri, dikelompokkan per penulis dan diurutkan:
 * story sendiri selalu di depan, lalu yang belum pernah dilihat, lalu yang
 * sudah dilihat semua (sama seperti urutan tray di Instagram/WhatsApp).
 */
export async function getStoryTray(
  supabase: SupabaseClient,
  userId: string | undefined,
  hiddenUserIds: string[] = []
): Promise<StoryGroup[]> {
  if (!userId) return [];

  const { data: followingRows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  const followingIds = (followingRows ?? []).map((r) => r.following_id as string);
  const authorIds = [...new Set([userId, ...followingIds])].filter((id) => UUID_PATTERN.test(id));
  const safeHiddenIds = hiddenUserIds.filter((id) => UUID_PATTERN.test(id));
  const visibleAuthorIds = authorIds.filter((id) => id === userId || !safeHiddenIds.includes(id));

  if (visibleAuthorIds.length === 0) return [];

  const { data: rawStories, error } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .in("author_id", visibleAuthorIds)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error || !rawStories || rawStories.length === 0) return [];

  const storyIds = rawStories.map((s) => s.id as string);
  const { data: viewRows } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("viewer_id", userId)
    .in("story_id", storyIds);

  const viewedIds = new Set((viewRows ?? []).map((r) => r.story_id as string));

  const uniqueAuthorIds = [...new Set(rawStories.map((s) => s.author_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, is_admin, is_verified, created_at")
    .in("id", uniqueAuthorIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  const groups = new Map<string, StoryGroup>();
  for (const raw of rawStories) {
    const author = profileMap.get(raw.author_id as string);
    if (!author) continue;

    const story: Story = {
      id: raw.id,
      author_id: raw.author_id,
      image_url: raw.image_url,
      image_width: raw.image_width,
      image_height: raw.image_height,
      video_url: raw.video_url,
      video_width: raw.video_width,
      video_height: raw.video_height,
      video_duration_sec: raw.video_duration_sec,
      caption: raw.caption ?? "",
      bg_color: raw.bg_color ?? "#000000",
      view_count: raw.view_count ?? 0,
      created_at: raw.created_at,
      expires_at: raw.expires_at,
      viewed_by_me: viewedIds.has(raw.id as string),
    };

    const existing = groups.get(raw.author_id as string);
    if (existing) {
      existing.stories.push(story);
    } else {
      groups.set(raw.author_id as string, { author, stories: [story], allViewed: false });
    }
  }

  for (const group of groups.values()) {
    group.allViewed = group.stories.every((s) => s.viewed_by_me);
  }

  const result = [...groups.values()];
  result.sort((a, b) => {
    if (a.author.id === userId) return -1;
    if (b.author.id === userId) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return 0;
  });

  return result;
}

export async function getMyStories(supabase: SupabaseClient, userId: string): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("author_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((raw) => ({
    id: raw.id,
    author_id: raw.author_id,
    image_url: raw.image_url,
    image_width: raw.image_width,
    image_height: raw.image_height,
    video_url: raw.video_url,
    video_width: raw.video_width,
    video_height: raw.video_height,
    video_duration_sec: raw.video_duration_sec,
    caption: raw.caption ?? "",
    bg_color: raw.bg_color ?? "#000000",
    view_count: raw.view_count ?? 0,
    created_at: raw.created_at,
    expires_at: raw.expires_at,
    viewed_by_me: true,
  }));
}
