// Lapisan tipis di atas API AI gratis (Groq + Google Gemini).
// Groq dicoba lebih dulu (sangat cepat, limit gratis longgar), lalu fallback ke Gemini
// kalau Groq gagal/limit habis/key tidak diset. Keduanya opsional — kalau dua-duanya
// tidak diset, fungsi melempar AiUnavailableError yang ditangani di lapisan action.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export class AiUnavailableError extends Error {
  constructor(message = "Fitur AI belum dikonfigurasi. Tambahkan GROQ_API_KEY atau GEMINI_API_KEY di .env.local.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
};

async function callGroq(messages: ChatMessage[], opts: CompleteOptions): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 512,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Groq: respons kosong");
  return text.trim();
}

async function callGemini(messages: ChatMessage[], opts: CompleteOptions): Promise<string> {
  const systemMsgs = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");

  const contents = turns.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsgs.length ? { parts: [{ text: systemMsgs.join("\n\n") }] } : undefined,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 512,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (typeof text !== "string" || !text.trim()) throw new Error("Gemini: respons kosong");
  return text.trim();
}

/**
 * Kirim percakapan ke provider AI yang tersedia. Coba Groq dulu, fallback ke Gemini.
 * Melempar AiUnavailableError kalau tidak ada key yang diset sama sekali, atau
 * Error biasa kalau semua provider yang tersedia gagal dipanggil.
 */
export async function aiComplete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    throw new AiUnavailableError();
  }

  const errors: string[] = [];

  if (GROQ_API_KEY) {
    try {
      return await callGroq(messages, opts);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (GEMINI_API_KEY) {
    try {
      return await callGemini(messages, opts);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(`Semua provider AI gagal: ${errors.join(" | ")}`);
}
