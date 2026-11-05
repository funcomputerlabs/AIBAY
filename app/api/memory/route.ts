import { MAX_MEMORY_CHARS } from "@/lib/constants";
import { lookupFirebaseUser } from "@/lib/firebase-token";
import { isGroqConfigured, reviseMemory, toPublicError } from "@/lib/groq";
import { isLocale } from "@/lib/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await lookupFirebaseUser(request.headers.get("authorization"));
  if (!user) {
    return Response.json({ error: "authFailed" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const body = payload as { memory?: unknown; user?: unknown; assistant?: unknown; locale?: unknown };
  const memory = clip(body.memory, MAX_MEMORY_CHARS);
  const person = clip(body.user, 2_000);
  const reply = clip(body.assistant, 2_000);
  const locale = isLocale(body.locale) ? body.locale : "en";

  if (!person) {
    return Response.json({ text: memory }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!isGroqConfigured()) {
    return Response.json(
      { error: "Groq is not configured. Set GROQ_API_KEY on the server." },
      { status: 503 },
    );
  }

  try {
    const text = await reviseMemory(memory, person, reply, locale, request.signal);
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const safe = toPublicError(error);
    return Response.json({ error: safe.message }, { status: safe.status });
  }
}

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}
