import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";

const MODEL = "google/gemini-3.1-flash-image";
const ENDPOINT = "https://ai-gateway.vercel.sh/v1/chat/completions";

export async function generateImage(prompt: string, signal: AbortSignal) {
  const token = await gatewayToken();
  if (!token) {
    throw new ImageError("unavailable", 503);
  }

  const timeout = AbortSignal.timeout(55_000);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["text", "image"],
      providerOptions: {
        google: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "1K" },
        },
      },
      stream: false,
    }),
    signal: AbortSignal.any([signal, timeout]),
  });

  if (response.status === 429) throw new ImageError("rate", 429);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("AIBAY image request failed", {
      status: response.status,
      detail: detail.replace(/\s+/g, " ").slice(0, 240),
    });
    throw new ImageError("failed", response.status >= 500 ? 502 : 400);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };

  const message = payload.choices?.[0]?.message;
  const fromImages = message?.images?.find((item) => item.image_url?.url)?.image_url?.url;
  const fromParts = Array.isArray(message?.content)
    ? message.content.find(
        (part) =>
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "image_url" &&
          typeof (part as { image_url?: { url?: string } }).image_url?.url === "string",
      )
    : null;
  const dataUrl =
    (typeof fromImages === "string" ? fromImages : null) ??
    (fromParts && typeof fromParts === "object"
      ? (fromParts as { image_url?: { url?: string } }).image_url?.url
      : null);

  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    throw new ImageError("failed", 502);
  }

  const caption = typeof message?.content === "string" ? message.content.trim() : "";
  return { dataUrl, caption };
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

async function gatewayToken() {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (key) return key;
  try {
    return await Promise.race([
      getVercelOidcToken(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
    ]);
  } catch {
    return null;
  }
}
