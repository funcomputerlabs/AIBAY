import "server-only";

const ENDPOINT = "https://image.pollinations.ai/prompt/";

export async function generateImage(prompt: string, signal: AbortSignal) {
  const text = prompt.replace(/\s+/g, " ").trim().slice(0, 500);
  const url = `${ENDPOINT}${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&model=flux`;
  const timeout = AbortSignal.timeout(55_000);
  const response = await fetch(url, {
    headers: { Accept: "image/jpeg,image/png,image/webp" },
    signal: AbortSignal.any([signal, timeout]),
  });

  if (response.status === 429) throw new ImageError("rate", 429);
  if (!response.ok) {
    console.error("AIBAY image request failed", { status: response.status });
    throw new ImageError("failed", response.status >= 500 ? 502 : 400);
  }

  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isImage(bytes, mime)) throw new ImageError("failed", 502);

  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    caption: "",
  };
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
