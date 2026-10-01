import { createMedia, StudioError } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "mediaFailed" }, { status: 400 });
  }

  const body = payload && typeof payload === "object" ? (payload as { kind?: unknown; prompt?: unknown; jobId?: unknown }) : {};
  const kind = body.kind === "video" || body.kind === "music" ? body.kind : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.replace(/\u0000/g, "").trim() : "";
  const jobId = typeof body.jobId === "string" ? body.jobId.slice(0, 120) : undefined;
  if (!kind || (!prompt && !jobId) || prompt.length > 1_000) {
    return Response.json({ error: "mediaFailed" }, { status: 400 });
  }

  try {
    const result = await createMedia(kind, prompt, jobId, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof StudioError) {
      const code = error.code === "unavailable" ? `${kind}Unavailable` : error.code === "rate" ? `${kind}Rate` : `${kind}Failed`;
      return Response.json({ error: code }, { status: error.status });
    }
    console.error("AIBAY media request failed");
    return Response.json({ error: kind === "music" ? "musicFailed" : "videoFailed" }, { status: 502 });
  }
}
