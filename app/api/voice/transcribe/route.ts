import { isLocale } from "@/lib/locale";
import { toPublicError, transcribeAudio } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8_000_000;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "callFailed" }, { status: 400 });
  }

  const audio = form.get("audio");
  const requested = form.get("locale");
  const locale = isLocale(requested) ? requested : "en";
  if (!(audio instanceof File) || audio.size < 800) {
    return Response.json({ error: "callFailed" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "callFailed" }, { status: 413 });
  }

  try {
    const text = await transcribeAudio(audio, locale);
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof Error && error.message === "unavailable") {
      return Response.json({ error: "keyMissing" }, { status: 503 });
    }
    const safe = toPublicError(error);
    console.error("AIBAY voice transcribe failed", { status: safe.status });
    return Response.json({ error: "callFailed" }, { status: safe.status });
  }
}
