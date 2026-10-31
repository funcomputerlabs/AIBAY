import { speakEnglish, toPublicError } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "callFailed" }, { status: 400 });
  }

  const text =
    payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.replace(/\u0000/g, "").trim()
      : "";
  if (!text) return Response.json({ error: "callFailed" }, { status: 400 });

  try {
    const wav = await speakEnglish(text);
    return new Response(wav, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof Error && error.message === "unavailable") {
      return Response.json({ error: "keyMissing" }, { status: 503 });
    }
    const safe = toPublicError(error);
    console.error("AIBAY voice speak failed", { status: safe.status });
    return Response.json({ error: "callFailed" }, { status: safe.status });
  }
}
