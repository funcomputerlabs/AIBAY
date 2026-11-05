import { MAX_BODY_BYTES, MAX_MEMORY_CHARS } from "@/lib/constants";
import { lookupFirebaseUser } from "@/lib/firebase-token";
import { getGlobalImprove, rememberGlobalImprove } from "@/lib/global-improve";
import { createChatStream, getGroqModel, isGroqConfigured, toPublicError } from "@/lib/groq";
import { isLocale } from "@/lib/locale";
import { validateMessages } from "@/lib/messages";
import { isOwnerEmail } from "@/lib/owner";
import { readPageContext } from "@/lib/page";

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

  const body = payload as { locale?: unknown; improve?: unknown; task?: unknown; memory?: unknown; page?: unknown };
  const locale = isLocale(body.locale) ? body.locale : "en";
  const account = await lookupFirebaseUser(request.headers.get("authorization"));
  const owner = Boolean(account && isOwnerEmail(account.email));
  const fromOwner =
    owner && typeof body.improve === "string"
      ? body.improve.replace(/\u0000/g, "").trim().slice(0, 8_000)
      : "";
  if (fromOwner) rememberGlobalImprove(fromOwner);
  const memory =
    account && body.task !== "improve" && typeof body.memory === "string"
      ? body.memory.replace(/\u0000/g, "").trim().slice(0, MAX_MEMORY_CHARS)
      : "";
  const extra = {
    instructions: fromOwner || (await getGlobalImprove()),
    ...(memory ? { memory } : {}),
    task:
      owner && body.task === "improve"
        ? ("improve" as const)
        : body.task === "voice"
          ? ("voice" as const)
          : undefined,
    page: readPageContext(body.page),
  };

  if (!isGroqConfigured()) {
    return Response.json(
      { error: "Groq is not configured. Set GROQ_API_KEY on the server." },
      { status: 503 },
    );
  }

  let completion;
  try {
    completion = await createChatStream(validation.messages, request.signal, locale, extra);
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
