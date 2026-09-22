import { MAX_BODY_BYTES } from "@/lib/constants";
import { createChatStream, getGroqModel, isGroqConfigured, toPublicError } from "@/lib/groq";
import { isLocale } from "@/lib/locale";
import { validateMessages } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json(
    {
      configured: isGroqConfigured(),
      model: getGroqModel(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const validation = validateMessages(payload);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: validation.status });
  }

  const requested = (payload as { locale?: unknown }).locale;
  const locale = isLocale(requested) ? requested : "en";

  if (!isGroqConfigured()) {
    return Response.json(
      { error: "Groq is not configured. Set GROQ_API_KEY on the server." },
      { status: 503 },
    );
  }

  let completion;
  try {
    completion = await createChatStream(validation.messages, request.signal, locale);
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    const safe = toPublicError(error);
    console.error("AIBAY chat request failed", { status: safe.status });
    return Response.json({ error: safe.message }, { status: safe.status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          if (request.signal.aborted) break;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        console.error("AIBAY stream failed");
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
