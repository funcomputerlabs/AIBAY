import {
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_TEXT_CHARS,
  MAX_IMAGE_DATA_URL_CHARS,
} from "@/lib/constants";
import type { Attachment } from "@/lib/types";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "sql",
  "yaml",
  "yml",
  "toml",
  "ini",
  "log",
  "sh",
  "svg",
]);

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type ReadAttachmentResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; error: string };

export async function readAttachment(file: File): Promise<ReadAttachmentResult> {
  const name = safeName(file.name);
  if (file.size <= 0) {
    return { ok: false, error: "emptyFile" };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "fileTooLarge" };
  }

  if (IMAGE_TYPES.has(file.type)) {
    try {
      const dataUrl = await imageDataUrl(file);
      return {
        ok: true,
        attachment: {
          id: crypto.randomUUID(),
          name,
          mime: "image/jpeg",
          kind: "image",
          dataUrl,
        },
      };
    } catch {
      return { ok: false, error: "unreadableImage" };
    }
  }

  if (!isTextFile(file)) {
    return { ok: false, error: "unsupported" };
  }

  try {
    const raw = (await file.text()).replace(/\u0000/g, "");
    const text = raw.trim();
    if (!text) return { ok: false, error: "emptyFile" };
    const clipped =
      text.length > MAX_FILE_TEXT_CHARS
        ? `${text.slice(0, MAX_FILE_TEXT_CHARS)}\n…[truncated]`
        : text;
    return {
      ok: true,
      attachment: {
        id: crypto.randomUUID(),
        name,
        mime: file.type || "text/plain",
        kind: "file",
        text: clipped,
      },
    };
  } catch {
    return { ok: false, error: "unreadableFile" };
  }
}

function isTextFile(file: File) {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(extension);
}

function safeName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "file").slice(0, 120);
}

function imageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      try {
        resolve(drawImage(image));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    image.src = url;
  });
}

export function compressDataUrl(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(drawImage(image));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("unreadable"));
    image.src = dataUrl;
  });
}

function drawImage(image: HTMLImageElement) {
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("unreadable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
    throw new Error("too-large");
  }
  return dataUrl;
}
