import "server-only";

const MODEL = "gemini-3.1-flash-image";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export async function generateImage(prompt: string, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ImageError("unavailable", 503);

  const timeout = AbortSignal.timeout(55_000);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: "text", text: prompt.slice(0, 1_000) }],
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

function isImage(bytes: Buffer, mime: string) {
  if (bytes.length < 32 || bytes.length > 4_000_000) return false;
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50;
  if (mime === "image/gif") return bytes.subarray(0, 3).toString("ascii") === "GIF";
  if (mime === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF";
  return false;
}
