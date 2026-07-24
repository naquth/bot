import type { SupabaseClient } from "@supabase/supabase-js";
import type { Post } from "@/lib/types";

// PENTING: jangan tambahkan nested join self-referencing (mis. quoted post,
// reply parent) langsung ke POST_SELECT. PostgREST kesulitan membedakan
// constraint FK yang sama dipakai lebih dari sekali dalam satu query
// (contoh: posts_author_id_fkey dipakai untuk post utama DAN untuk author
// dari quoted-post di dalam nested select). Ini bisa membuat seluruh query
// gagal secara diam-diam tanpa error yang jelas ke pengguna, dan pernah
// menyebabkan feed & post baru tidak muncul sama sekali meski data sudah
// tersimpan di database. Semua relasi tambahan (quoted post, bookmark,
// reply count) diambil lewat query terpisah di hydratePosts().
const POST_SELECT = `id, author_id, content, parent_id, image_url, image_width, image_height, video_url, video_width, video_height, video_duration_sec, video_thumbnail_url, edited_at, quote_post_id, pinned_at, view_count, visibility, created_at,
  author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, bio, is_verified, created_at),
  likes(user_id)`;

// Validasi bentuk UUID sebelum dipakai dalam string interpolation query
// (mis. filter "not in (...)"), sebagai lapis pertahanan tambahan meski
// nilainya sudah bersumber dari kolom UUID di database, bukan input bebas.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getFeedPosts(
  supabase: SupabaseClient,
  userId: string | undefined,
  limit = 30,
  blockedUserIds: string[] = []
) {
  const safeBlockedIds = blockedUserIds.filter((id) => UUID_PATTERN.test(id));
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (safeBlockedIds.length > 0) {
    query = query.not("author_id", "in", `(${safeBlockedIds.join(",")})`);
  }

  const { data: rawPosts, error } = await query;

  if (error) {
    console.error("[getFeedPosts] gagal mengambil feed:", error.message, error.details, error.hint);
    return { posts: [], failed: true };
  }

  return { posts: await hydratePosts(supabase, rawPosts ?? [], userId), failed: false };
}

export async function getFeedPostsBefore(
  supabase: SupabaseClient,
  userId: string | undefined,
  cursor: string,
  limit = 20,
  blockedUserIds: string[] = []
) {
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .is("parent_id", null)
    .lt("created_at", cursor)
    .order("created_at", { ascending: false })
    .limit(limit);

  const safeBlockedIds = blockedUserIds.filter((id) => UUID_PATTERN.test(id));
  if (safeBlockedIds.length > 0) {
    query = query.not("author_id", "in", `(${safeBlockedIds.join(",")})`);
  }

  const { data: rawPosts, error } = await query;

  if (error) {
    console.error("[getFeedPostsBefore] gagal mengambil feed:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

export async function getFollowingFeed(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
  blockedUserIds: string[] = []
) {
  const { data: followingRows, error: followError } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (followError) {
    console.error("[getFollowingFeed] gagal mengambil daftar following:", followError.message);
    return { posts: [], failed: true };
  }

  const followingIds = (followingRows ?? []).map((f) => f.following_id as string);
  if (followingIds.length === 0) return { posts: [], failed: false };

  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .is("parent_id", null)
    .in("author_id", followingIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  const safeBlockedIds = blockedUserIds.filter((id) => UUID_PATTERN.test(id));
  if (safeBlockedIds.length > 0) {
    query = query.not("author_id", "in", `(${safeBlockedIds.join(",")})`);
  }

  const { data: rawPosts, error } = await query;

  if (error) {
    console.error("[getFollowingFeed] gagal mengambil feed:", error.message, error.details, error.hint);
    return { posts: [], failed: true };
  }

  return { posts: await hydratePosts(supabase, rawPosts ?? [], userId), failed: false };
}

export async function getVideoFeed(supabase: SupabaseClient, userId: string | undefined, limit = 20) {
  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getVideoFeed] gagal mengambil video:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

export async function getVideoFeedBefore(
  supabase: SupabaseClient,
  userId: string | undefined,
  cursor: string,
  limit = 10
) {
  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .not("video_url", "is", null)
    .lt("created_at", cursor)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getVideoFeedBefore] gagal mengambil video:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

export async function getUserPosts(supabase: SupabaseClient, authorId: string, userId: string | undefined) {
  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[getUserPosts] gagal mengambil post pengguna:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

export async function getPost(supabase: SupabaseClient, postId: string, userId: string | undefined) {
  const { data: rawPost, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("[getPost] gagal mengambil post:", error.message, error.details, error.hint);
    return null;
  }
  if (!rawPost) return null;

  const [post] = await hydratePosts(supabase, [rawPost], userId);
  return post ?? null;
}

export async function getThread(supabase: SupabaseClient, postId: string, userId: string | undefined) {
  const { data: rawPost, error: postError } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("[getThread] gagal mengambil post:", postError.message, postError.details, postError.hint);
    return { post: null, replies: [] as Post[] };
  }
  if (!rawPost) return { post: null, replies: [] as Post[] };

  const { data: rawReplies, error: repliesError } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("parent_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (repliesError) {
    console.error("[getThread] gagal mengambil balasan:", repliesError.message, repliesError.details, repliesError.hint);
  }

  const [post] = await hydratePosts(supabase, [rawPost], userId);
  const replies = await hydratePosts(supabase, rawReplies ?? [], userId);

  return { post, replies };
}

export async function getUnreadCount(supabase: SupabaseClient, userId: string | undefined) {
  if (!userId) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  return count ?? 0;
}

export async function getUnreadMessageCount(supabase: SupabaseClient, userId: string | undefined) {
  if (!userId) return 0;
  const { data: parts } = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", userId);

  const convIds = (parts ?? []).map((p) => p.conversation_id as string);
  if (convIds.length === 0) return 0;

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .in("conversation_id", convIds)
    .eq("read", false)
    .neq("sender_id", userId);

  return count ?? 0;
}

export async function getBookmarkedPosts(supabase: SupabaseClient, userId: string) {
  const { data: bookmarkRows, error: bookmarkError } = await supabase
    .from("bookmarks")
    .select("post_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (bookmarkError) {
    console.error("[getBookmarkedPosts] gagal mengambil daftar bookmark:", bookmarkError.message);
    return [];
  }

  const ids = (bookmarkRows ?? []).map((b) => b.post_id as string);
  if (ids.length === 0) return [];

  const { data: rawPosts, error } = await supabase.from("posts").select(POST_SELECT).in("id", ids);

  if (error) {
    console.error("[getBookmarkedPosts] gagal mengambil post:", error.message, error.details, error.hint);
    return [];
  }

  const hydrated = await hydratePosts(supabase, rawPosts ?? [], userId);
  const order = new Map(ids.map((id, i) => [id, i]));
  return hydrated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function searchPosts(supabase: SupabaseClient, query: string, userId: string | undefined, limit = 20) {
  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[searchPosts] gagal mencari post:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

export async function getTrendingPosts(supabase: SupabaseClient, userId: string | undefined, limit = 30) {
  // Jelajahi: post 7 hari terakhir yang punya minimal 1 suka, diurutkan dari yang
  // punya gambar (lebih menarik secara visual) lalu terbaru. Pendekatan ringan
  // tanpa menghitung skor engagement kompleks di database.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .is("parent_id", null)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getTrendingPosts] gagal mengambil utas populer:", error.message, error.details, error.hint);
    return [];
  }

  const hydrated = await hydratePosts(supabase, rawPosts ?? [], userId);

  return hydrated
    .filter((p) => p.like_count > 0 || p.reply_count > 0 || p.image_url)
    .sort((a, b) => {
      const scoreA = a.like_count * 2 + a.reply_count + (a.image_url ? 1 : 0);
      const scoreB = b.like_count * 2 + b.reply_count + (b.image_url ? 1 : 0);
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

export async function getPostsByHashtag(supabase: SupabaseClient, tag: string, userId: string | undefined, limit = 30) {
  const { data: hashtagRow, error: tagError } = await supabase
    .from("hashtags")
    .select("id")
    .eq("tag", tag.toLowerCase())
    .maybeSingle();

  if (tagError) {
    console.error("[getPostsByHashtag] gagal mencari hashtag:", tagError.message);
    return [];
  }
  if (!hashtagRow) return [];

  const { data: links, error: linksError } = await supabase
    .from("post_hashtags")
    .select("post_id")
    .eq("hashtag_id", hashtagRow.id);

  if (linksError) {
    console.error("[getPostsByHashtag] gagal mengambil relasi post-hashtag:", linksError.message);
    return [];
  }

  const ids = (links ?? []).map((l) => l.post_id as string);
  if (ids.length === 0) return [];

  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getPostsByHashtag] gagal mengambil post:", error.message, error.details, error.hint);
    return [];
  }

  return hydratePosts(supabase, rawPosts ?? [], userId);
}

async function hydratePosts(
  supabase: SupabaseClient,
  rawPosts: Record<string, unknown>[],
  userId: string | undefined
): Promise<Post[]> {
  if (rawPosts.length === 0) return [];

  const ids = rawPosts.map((p) => p.id as string);

  const { data: replyCounts } = await supabase
    .from("posts")
    .select("parent_id")
    .in("parent_id", ids);

  const replyCountMap = new Map<string, number>();
  replyCounts?.forEach((r: { parent_id: string | null }) => {
    if (r.parent_id) {
      replyCountMap.set(r.parent_id, (replyCountMap.get(r.parent_id) ?? 0) + 1);
    }
  });

  // Bookmark diambil terpisah (bukan lewat join) karena RLS bookmarks membatasi
  // baris hanya milik user yang login — join langsung ke tabel posts bisa
  // menyebabkan seluruh baris post hilang dari hasil select di beberapa kasus.
  let bookmarkedIds = new Set<string>();
  if (userId) {
    const { data: myBookmarks } = await supabase
      .from("bookmarks")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids);
    bookmarkedIds = new Set((myBookmarks ?? []).map((b) => b.post_id as string));
  }

  // Quoted post diambil terpisah (bukan nested join) — lihat catatan di
  // POST_SELECT soal kenapa self-referencing join dihindari di sini.
  const quotePostIds = rawPosts
    .map((p) => p.quote_post_id as string | null)
    .filter((id): id is string => id !== null);

  const quotedMap = new Map<
    string,
    { id: string; content: string; image_url: string | null; author: { username: string; display_name: string; avatar_url: string | null } }
  >();

  if (quotePostIds.length > 0) {
    const { data: quotedRows, error: quotedError } = await supabase
      .from("posts")
      .select("id, content, image_url, author:profiles!posts_author_id_fkey(username, display_name, avatar_url)")
      .in("id", quotePostIds);

    if (quotedError) {
      console.error("[hydratePosts] gagal mengambil quoted post:", quotedError.message);
    } else {
      (quotedRows ?? []).forEach((q) => {
        quotedMap.set(q.id as string, {
          id: q.id as string,
          content: q.content as string,
          image_url: q.image_url as string | null,
          author: q.author as unknown as { username: string; display_name: string; avatar_url: string | null },
        });
      });
    }
  }

  // Poll diambil terpisah dengan 3 query kecil (polls -> options -> votes),
  // digabung manual di JS — mengikuti pola aman yang sama seperti quoted-post
  // dan bookmark, alih-alih nested join yang rawan gagal secara diam-diam.
  const { data: pollRows } = await supabase.from("polls").select("id, post_id, closes_at").in("post_id", ids);
  const pollsByPostId = new Map<string, { id: string; closes_at: string }>();
  (pollRows ?? []).forEach((p) => pollsByPostId.set(p.post_id as string, { id: p.id as string, closes_at: p.closes_at as string }));

  const pollIds = (pollRows ?? []).map((p) => p.id as string);
  const optionsByPollId = new Map<string, { id: string; label: string; position: number }[]>();
  const voteCountByOptionId = new Map<string, number>();
  const myVoteByPollId = new Map<string, string>();

  if (pollIds.length > 0) {
    const { data: optionRows } = await supabase
      .from("poll_options")
      .select("id, poll_id, label, position")
      .in("poll_id", pollIds)
      .order("position", { ascending: true });

    (optionRows ?? []).forEach((o) => {
      const list = optionsByPollId.get(o.poll_id as string) ?? [];
      list.push({ id: o.id as string, label: o.label as string, position: o.position as number });
      optionsByPollId.set(o.poll_id as string, list);
    });

    const optionIds = (optionRows ?? []).map((o) => o.id as string);
    if (optionIds.length > 0) {
      const { data: voteRows } = await supabase.from("poll_votes").select("option_id, voter_id, poll_id").in("poll_id", pollIds);

      (voteRows ?? []).forEach((v) => {
        const optId = v.option_id as string;
        voteCountByOptionId.set(optId, (voteCountByOptionId.get(optId) ?? 0) + 1);
        if (userId && v.voter_id === userId) {
          myVoteByPollId.set(v.poll_id as string, optId);
        }
      });
    }
  }

  return rawPosts.map((p) => {
    const likesArr = (p.likes as { user_id: string }[]) ?? [];
    const quotePostId = p.quote_post_id as string | null;
    const quoted = quotePostId ? quotedMap.get(quotePostId) : undefined;
    const postId = p.id as string;

    const pollMeta = pollsByPostId.get(postId);
    const poll = pollMeta
      ? {
          id: pollMeta.id,
          closes_at: pollMeta.closes_at,
          options: (optionsByPollId.get(pollMeta.id) ?? []).map((o) => ({
            ...o,
            vote_count: voteCountByOptionId.get(o.id) ?? 0,
          })),
          total_votes: (optionsByPollId.get(pollMeta.id) ?? []).reduce(
            (sum, o) => sum + (voteCountByOptionId.get(o.id) ?? 0),
            0
          ),
          my_vote_option_id: myVoteByPollId.get(pollMeta.id) ?? null,
        }
      : null;

    return {
      id: postId,
      author_id: p.author_id as string,
      content: p.content as string,
      parent_id: p.parent_id as string | null,
      image_url: p.image_url as string | null,
      image_width: p.image_width as number | null,
      image_height: p.image_height as number | null,
      video_url: p.video_url as string | null,
      video_width: p.video_width as number | null,
      video_height: p.video_height as number | null,
      video_duration_sec: p.video_duration_sec as number | null,
      video_thumbnail_url: p.video_thumbnail_url as string | null,
      edited_at: p.edited_at as string | null,
      quote_post_id: quotePostId,
      quoted_post: quotePostId
        ? quoted
          ? { ...quoted, deleted: false }
          : { id: quotePostId, content: "", image_url: null, author: { username: "", display_name: "", avatar_url: null }, deleted: true }
        : null,
      pinned_at: p.pinned_at as string | null,
      view_count: (p.view_count as number | null) ?? 0,
      poll,
      visibility: (p.visibility as Post["visibility"]) ?? "public",
      created_at: p.created_at as string,
      author: p.author as unknown as Post["author"],
      like_count: likesArr.length,
      reply_count: replyCountMap.get(postId) ?? 0,
      liked_by_me: userId ? likesArr.some((l) => l.user_id === userId) : false,
      bookmarked_by_me: bookmarkedIds.has(postId),
    };
  });
}
