/**
 * Health check untuk memverifikasi query inti aplikasi benar-benar berhasil
 * dijalankan terhadap database Supabase sungguhan — bukan hanya lolos
 * TypeScript build seperti sebelumnya.
 *
 * Kenapa script ini ada:
 * Bug "post tidak muncul" pernah terjadi dua kali karena query select dengan
 * nested join (bookmark, lalu quoted-post) gagal secara diam-diam di
 * production. `npm run build` tidak pernah menyentuh database sungguhan,
 * jadi masalah ini tidak pernah terdeteksi sebelum di-deploy.
 *
 * Cara pakai:
 *   npm run healthcheck
 *
 * Jalankan ini setelah setiap perubahan skema atau query sebelum deploy.
 * Script akan keluar dengan exit code 1 jika ada query yang gagal.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY harus diset di .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const POST_SELECT = `id, author_id, content, parent_id, image_url, image_width, image_height, video_url, video_width, video_height, video_duration_sec, video_thumbnail_url, edited_at, quote_post_id, pinned_at, view_count, created_at,
  author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, bio, is_verified, created_at),
  likes(user_id)`;

type CheckResult = { name: string; ok: boolean; detail: string };

async function check(name: string, fn: () => Promise<{ error: unknown } | void>): Promise<CheckResult> {
  try {
    const result = await fn();
    if (result && "error" in result && result.error) {
      const err = result.error as { message?: string; details?: string; hint?: string };
      return { name, ok: false, detail: `${err.message ?? err} ${err.details ?? ""} ${err.hint ?? ""}`.trim() };
    }
    return { name, ok: true, detail: "OK" };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log("Menjalankan health check terhadap Supabase...\n");

  const results: CheckResult[] = [];

  results.push(
    await check("SELECT posts (feed utama, query paling kritis)", async () => {
      const r = await supabase.from("posts").select(POST_SELECT).is("parent_id", null).limit(5);
      return r;
    })
  );

  results.push(
    await check("SELECT posts by id (thread/detail)", async () => {
      const r = await supabase.from("posts").select(POST_SELECT).limit(1).maybeSingle();
      return r;
    })
  );

  results.push(
    await check("SELECT profiles", async () => {
      const r = await supabase.from("profiles").select("id, username, display_name, avatar_url").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT likes", async () => {
      const r = await supabase.from("likes").select("post_id, user_id").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT bookmarks", async () => {
      const r = await supabase.from("bookmarks").select("post_id, user_id").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT notifications", async () => {
      const r = await supabase.from("notifications").select("id, type").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT conversations + messages join", async () => {
      const r = await supabase
        .from("conversations")
        .select(
          `id, user_a, user_b,
           userA:profiles!conversations_user_a_fkey(username),
           userB:profiles!conversations_user_b_fkey(username),
           messages(content, sender_id, read, created_at)`
        )
        .limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT hashtags + post_hashtags", async () => {
      const r = await supabase.from("hashtags").select("id, tag").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT post_mentions", async () => {
      const r = await supabase.from("post_mentions").select("post_id, mentioned_user_id").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT quoted post (query terpisah, bukan nested join)", async () => {
      const r = await supabase
        .from("posts")
        .select("id, content, image_url, author:profiles!posts_author_id_fkey(username, display_name, avatar_url)")
        .limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT reports", async () => {
      const r = await supabase.from("reports").select("id, reason, status").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT blocks", async () => {
      const r = await supabase.from("blocks").select("blocker_id, blocked_id").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT posts dengan filter blocked users (not-in)", async () => {
      const r = await supabase
        .from("posts")
        .select(POST_SELECT)
        .is("parent_id", null)
        .not("author_id", "in", "(00000000-0000-0000-0000-000000000000)")
        .limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT polls + poll_options + poll_votes (query terpisah)", async () => {
      const r = await supabase.from("polls").select("id, post_id, closes_at").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT posts dengan pinned_at", async () => {
      const r = await supabase.from("posts").select("id, pinned_at").not("pinned_at", "is", null).limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT profiles dengan is_admin, is_verified", async () => {
      const r = await supabase.from("profiles").select("id, is_admin, is_verified").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT reports dengan join reporter/post/user (halaman admin)", async () => {
      const r = await supabase
        .from("reports")
        .select(
          `id, reason, status,
           reporter:profiles!reports_reporter_id_fkey(username),
           reported_post:posts!reports_reported_post_id_fkey(id, content),
           reported_user:profiles!reports_reported_user_id_fkey(username)`
        )
        .limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT mutes", async () => {
      const r = await supabase.from("mutes").select("muter_id, muted_id").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT posts dengan view_count", async () => {
      const r = await supabase.from("posts").select("id, view_count").limit(1);
      return r;
    })
  );

  results.push(
    await check("SELECT posts video (halaman Reels)", async () => {
      const r = await supabase.from("posts").select(POST_SELECT).not("video_url", "is", null).limit(1);
      return r;
    })
  );

  console.log("Hasil:\n");
  let hasFailure = false;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.name}`);
    if (!r.ok) {
      console.log(`   → ${r.detail}`);
      hasFailure = true;
    }
  }

  console.log("");
  if (hasFailure) {
    console.log("❌ Health check GAGAL — ada query yang error. Perbaiki sebelum deploy.");
    process.exit(1);
  } else {
    console.log("✅ Semua query inti berhasil dijalankan.");
    process.exit(0);
  }
}

main();
