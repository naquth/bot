"use server";

import { createClient } from "@/lib/supabase/server";
import { aiComplete, AiUnavailableError, type ChatMessage } from "@/lib/ai/provider";
import { isCurrentUserAdmin } from "@/app/actions";
import { MAX_POST_LEN } from "@/lib/constants";

type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errMsg(e: unknown): string {
  if (e instanceof AiUnavailableError) return e.message;
  if (e instanceof Error) return "AI sedang tidak bisa diakses. Coba lagi sebentar lagi.";
  return "Terjadi kesalahan tak terduga.";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ---------- Bantuan bikin caption / post ----------

export type CaptionTone = "santai" | "profesional" | "lucu" | "menarik";

const TONE_LABEL: Record<CaptionTone, string> = {
  santai: "santai dan ngobrol biasa",
  profesional: "profesional dan rapi",
  lucu: "jenaka dan playful",
  menarik: "energik dan mengundang interaksi (engaging)",
};

export async function generateCaptionSuggestions(
  topic: string,
  tone: CaptionTone = "santai"
): Promise<AiResult<string[]>> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Kamu belum masuk." };

  const trimmed = topic.trim();
  if (!trimmed) return { ok: false, error: "Tulis dulu topik atau draf kasarnya." };
  if (trimmed.length > 2000) return { ok: false, error: "Topik terlalu panjang." };

  const system: ChatMessage = {
    role: "system",
    content:
      `Kamu adalah asisten penulisan caption untuk aplikasi microblogging bernama Utas (mirip Twitter/Threads, berbahasa Indonesia). ` +
      `Tugasmu: dari topik atau draf kasar yang diberikan user, buat 3 alternatif caption/post siap pakai. ` +
      `Gaya bahasa: ${TONE_LABEL[tone]}. Setiap caption maksimal ${MAX_POST_LEN} karakter, natural seperti orang Indonesia menulis di media sosial, ` +
      `boleh pakai emoji secukupnya dan hashtag relevan bila pas. Jangan pakai tanda kutip di sekeliling caption. ` +
      `Balas HANYA dalam format JSON array berisi 3 string, tanpa penjelasan lain, tanpa markdown code fence. Contoh: ["caption 1","caption 2","caption 3"]`,
  };
  const userMsg: ChatMessage = { role: "user", content: trimmed };

  try {
    const raw = await aiComplete([system, userMsg], { temperature: 0.9, maxTokens: 500 });
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // fallback: kalau model tidak balas JSON murni, pecah per baris
      const lines = cleaned
        .split("\n")
        .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
        .filter(Boolean);
      parsed = lines.slice(0, 3);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: "AI tidak memberi hasil yang bisa dipakai. Coba lagi." };
    }
    const suggestions = parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().slice(0, MAX_POST_LEN))
      .slice(0, 3);
    if (suggestions.length === 0) return { ok: false, error: "AI tidak memberi hasil yang bisa dipakai. Coba lagi." };
    return { ok: true, data: suggestions };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

// ---------- Ringkasan (TL;DR) utas + balasan ----------

export async function summarizeThread(postId: string): Promise<AiResult<string>> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Kamu belum masuk." };
  if (!postId || typeof postId !== "string") return { ok: false, error: "ID utas tidak valid." };

  const supabase = await createClient();

  const { data: rootPost, error: rootErr } = await supabase
    .from("posts")
    .select("id, content, author:profiles!posts_author_id_fkey(username)")
    .eq("id", postId)
    .maybeSingle();

  if (rootErr || !rootPost) return { ok: false, error: "Utas tidak ditemukan." };

  const { data: replies, error: repliesErr } = await supabase
    .from("posts")
    .select("content, author:profiles!posts_author_id_fkey(username)")
    .eq("parent_id", postId)
    .order("created_at", { ascending: true })
    .limit(60);

  if (repliesErr) {
    console.error("summarizeThread replies error:", repliesErr.message, repliesErr.details, repliesErr.hint);
  }

  type Row = { content: string; author: { username: string } | { username: string }[] | null };
  function authorName(a: Row["author"]): string {
    if (!a) return "?";
    return Array.isArray(a) ? (a[0]?.username ?? "?") : a.username;
  }

  const rootAuthor = authorName(rootPost.author as unknown as Row["author"]);
  const lines: string[] = [`@${rootAuthor}: ${rootPost.content}`];
  for (const r of (replies ?? []) as unknown as Row[]) {
    lines.push(`@${authorName(r.author)}: ${r.content}`);
  }

  if (lines.length === 1) {
    return { ok: false, error: "Belum ada balasan untuk diringkas." };
  }

  const transcript = lines.join("\n").slice(0, 6000);

  const system: ChatMessage = {
    role: "system",
    content:
      "Kamu meringkas percakapan dari aplikasi microblogging berbahasa Indonesia bernama Utas. " +
      "Diberikan post utama dan balasan-balasannya (format '@username: isi'), buat ringkasan singkat (TL;DR) 2-4 kalimat dalam Bahasa Indonesia yang natural, " +
      "menangkap inti diskusi dan sudut pandang utama yang muncul, tanpa menyebutkan bahwa ini ringkasan AI. Balas hanya teks ringkasannya, tanpa embel-embel.",
  };
  const userMsg: ChatMessage = { role: "user", content: transcript };

  try {
    const summary = await aiComplete([system, userMsg], { temperature: 0.4, maxTokens: 300 });
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

// ---------- Deteksi konten toxic/spam (moderasi) ----------

export type ModerationVerdict = {
  flagged: boolean;
  category: "aman" | "spam" | "pelecehan" | "ujaran_kebencian" | "kekerasan" | "lainnya";
  reason: string;
};

export async function moderateContent(postId: string): Promise<AiResult<ModerationVerdict>> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "Khusus admin." };
  if (!postId || typeof postId !== "string") return { ok: false, error: "ID utas tidak valid." };

  const supabase = await createClient();
  const { data: post, error } = await supabase.from("posts").select("content").eq("id", postId).maybeSingle();
  if (error || !post) return { ok: false, error: "Utas tidak ditemukan." };
  if (!post.content || !post.content.trim()) {
    return { ok: true, data: { flagged: false, category: "aman", reason: "Tidak ada teks untuk dianalisis." } };
  }

  const system: ChatMessage = {
    role: "system",
    content:
      "Kamu adalah alat bantu moderasi konten untuk admin aplikasi microblogging berbahasa Indonesia. " +
      "Analisis SATU post dan tentukan apakah melanggar salah satu kategori: spam, pelecehan, ujaran_kebencian, kekerasan, lainnya, atau aman. " +
      "Ini hanya rekomendasi untuk admin manusia, bukan keputusan final — jangan terlalu agresif menandai konten yang cuma kritik wajar atau bahasa kasar ringan tanpa target. " +
      'Balas HANYA JSON murni tanpa markdown, format persis: {"flagged":true/false,"category":"aman|spam|pelecehan|ujaran_kebencian|kekerasan|lainnya","reason":"alasan singkat 1 kalimat dalam Bahasa Indonesia"}',
  };
  const userMsg: ChatMessage = { role: "user", content: post.content.slice(0, 2000) };

  try {
    const raw = await aiComplete([system, userMsg], { temperature: 0.2, maxTokens: 200 });
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    const category: ModerationVerdict["category"] = [
      "aman",
      "spam",
      "pelecehan",
      "ujaran_kebencian",
      "kekerasan",
      "lainnya",
    ].includes(parsed?.category)
      ? parsed.category
      : "lainnya";
    return {
      ok: true,
      data: {
        flagged: Boolean(parsed?.flagged),
        category,
        reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 300) : "",
      },
    };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

// ---------- Chatbot AI ----------

export type ChatbotTurn = { role: "user" | "assistant"; content: string };

export async function askChatbot(history: ChatbotTurn[]): Promise<AiResult<string>> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Kamu belum masuk." };

  if (!Array.isArray(history) || history.length === 0) {
    return { ok: false, error: "Tidak ada pesan." };
  }
  const trimmedHistory = history.slice(-16).filter((m) => typeof m.content === "string" && m.content.trim());
  if (trimmedHistory.length === 0) return { ok: false, error: "Pesan kosong." };
  const lastMsg = trimmedHistory[trimmedHistory.length - 1];
  if (lastMsg.role !== "user") return { ok: false, error: "Pesan terakhir harus dari kamu." };
  if (lastMsg.content.length > 4000) return { ok: false, error: "Pesan terlalu panjang." };

  const system: ChatMessage = {
    role: "system",
    content:
      "Kamu adalah Asisten Utas, chatbot AI ramah di dalam aplikasi microblogging Utas (mirip Twitter/Threads, berbahasa Indonesia). " +
      "Jawab dalam Bahasa Indonesia yang santai tapi jelas, ringkas kalau bisa. Kamu bisa membantu apa saja: brainstorming ide post, " +
      "menjawab pertanyaan umum, membantu menulis, atau sekadar mengobrol. Kamu bukan bagian dari tim moderasi dan tidak punya akses ke data pribadi user.",
  };

  const messages: ChatMessage[] = [
    system,
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  try {
    const reply = await aiComplete(messages, { temperature: 0.7, maxTokens: 700 });
    return { ok: true, data: reply };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
