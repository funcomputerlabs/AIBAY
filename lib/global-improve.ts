import "server-only";

const MAX_IMPROVE_CHARS = 8_000;
const CACHE_MS = 8_000;

let cached = { text: "", at: 0 };

export async function getGlobalImprove() {
  if (Date.now() - cached.at < CACHE_MS) return cached.text;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) return cached.text;

  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/config/improve`,
      { signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    if (!response.ok) {
      cached = { text: cached.text, at: Date.now() };
      return cached.text;
    }
    const payload = (await response.json()) as {
      fields?: { text?: { stringValue?: string } };
    };
    const text = payload.fields?.text?.stringValue?.replace(/\u0000/g, "").trim().slice(0, MAX_IMPROVE_CHARS) ?? "";
    cached = { text, at: Date.now() };
    return text;
  } catch {
    return cached.text;
  }
}

export function rememberGlobalImprove(text: string) {
  cached = { text: text.replace(/\u0000/g, "").trim().slice(0, MAX_IMPROVE_CHARS), at: Date.now() };
}
