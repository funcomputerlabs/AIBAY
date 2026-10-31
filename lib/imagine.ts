import "server-only";

const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const IMAGE_CREATE = "https://api.magichour.ai/v1/ai-image-generator";
const IMAGE_STATUS = "https://api.magichour.ai/v1/image-projects/";

export async function generateImage(prompt: string, jobId: string | undefined, signal: AbortSignal) {
  const hourKey = process.env.MAGIC_HOUR_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (hourKey) {
    try {
      return await magicHourImage(prompt, hourKey, jobId, signal);
    } catch (error) {
      if (jobId) throw error;
      if (!(error instanceof ImageError) || error.code === "unavailable") throw error;
    }
  }

  if (geminiKey) return geminiImage(prompt, geminiKey, signal);
  throw new ImageError("unavailable", 503);
}

async function magicHourImage(prompt: string, apiKey: string, jobId: string | undefined, signal: AbortSignal) {
  const id = jobId || (await startMagicHour(prompt, apiKey, signal));
  const url = await waitForImage(id, apiKey, signal);
  if (!url) return { pending: true as const, jobId: id };
  return downloadImage(url, signal);
}

async function startMagicHour(prompt: string, apiKey: string, signal: AbortSignal) {
  const body = {
    name: "AIBAY",
    image_count: 1,
    model: "default",
    aspect_ratio: "1:1",
    resolution: "1k",
    style: { prompt: enrichImagePrompt(prompt, 1_000), tool: "general" },
  };
  let response = await postMagicHour(apiKey, body, signal);
  if (response.status === 402) {
    response = await postMagicHour(apiKey, { ...body, resolution: "640px" }, signal);
  }
  if (response.status === 429) throw new ImageError("rate", 429);
  if (response.status === 401 || response.status === 403) throw new ImageError("unavailable", 503);
  if (response.status === 402) throw new ImageError("failed", 402);
  if (!response.ok) {
    console.error("AIBAY image request failed", { status: response.status });
    throw new ImageError("failed", response.status >= 500 ? 502 : 400);
  }
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new ImageError("failed", 502);
  return payload.id;
}

function postMagicHour(apiKey: string, body: object, signal: AbortSignal) {
  return fetch(IMAGE_CREATE, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function waitForImage(id: string, apiKey: string, signal: AbortSignal) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new ImageError("failed", 499);
    const response = await fetch(`${IMAGE_STATUS}${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal,
    });
    if (!response.ok) throw new ImageError("failed", 502);
    const payload = (await response.json()) as { status?: string; downloads?: Array<{ url?: string }> };
    if (payload.status === "error" || payload.status === "canceled") throw new ImageError("failed", 502);
    const url = payload.downloads?.find((item) => item.url?.startsWith("https://"))?.url;
    if (payload.status === "complete") {
      if (!url) throw new ImageError("failed", 502);
      return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

async function downloadImage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  if (!response.ok) throw new ImageError("failed", 502);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim() || guessMime(bytes);
  if (!isImage(bytes, mime)) throw new ImageError("failed", 502);
  return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, caption: "" };
}

async function geminiImage(prompt: string, apiKey: string, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(55_000);
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: "text", text: enrichImagePrompt(prompt, 1_000) }],
    }),
    signal: AbortSignal.any([signal, timeout]),
  });

  if (response.status === 429) throw new ImageError("rate", 429);
  if (!response.ok) {
    console.error("AIBAY image request failed", { status: response.status });
    throw new ImageError("failed", response.status >= 500 ? 502 : 400);
  }

  const payload = (await response.json()) as {
    output_image?: { data?: string; mime_type?: string };
  };
  const data = payload.output_image?.data;
  if (!data) throw new ImageError("failed", 502);

  const bytes = Buffer.from(data, "base64");
  const mime = payload.output_image?.mime_type?.split(";")[0].trim() || "image/png";
  if (!isImage(bytes, mime)) throw new ImageError("failed", 502);
  return { dataUrl: `data:${mime};base64,${data}`, caption: "" };
}

export class ImageError extends Error {
  status: number;
  code: "unavailable" | "failed" | "rate";

  constructor(code: "unavailable" | "failed" | "rate", status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function enrichImagePrompt(prompt: string, max: number) {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (!text) return text;
  if (/photoreal|cinematic|detailed|8k|sharp/i.test(text)) return text.slice(0, max);
  return `${text}, coherent composition, natural light, sharp detail`.slice(0, max);
}

function guessMime(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return "image/webp";
  return "application/octet-stream";
}

function isImage(bytes: Buffer, mime: string) {
  if (bytes.length < 32 || bytes.length > 4_000_000) return false;
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50;
  if (mime === "image/gif") return bytes.subarray(0, 3).toString("ascii") === "GIF";
  if (mime === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF";
  return false;
}
