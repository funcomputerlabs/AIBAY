import { generateImage, ImageError } from "@/lib/imagine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "imageFailed" }, { status: 400 });
  }

  const prompt =
    payload && typeof payload === "object" && typeof (payload as { prompt?: unknown }).prompt === "string"
      ? (payload as { prompt: string }).prompt.replace(/\u0000/g, "").trim()
      : "";

  if (!prompt) return Response.json({ error: "imageEmpty" }, { status: 400 });
  if (prompt.length > 1_000) {
    return Response.json({ error: "imageFailed" }, { status: 400 });
  }

  try {
    const image = await generateImage(prompt, request.signal);
    return Response.json(image, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof ImageError) {
      const code = error.code === "unavailable" ? "imageUnavailable" : error.code === "rate" ? "imageRate" : "imageFailed";
      return Response.json({ error: code }, { status: error.status });
    }
    console.error("AIBAY image request failed");
    return Response.json({ error: "imageFailed" }, { status: 502 });
  }
}
