import {
  MAX_ATTACHMENTS,
  MAX_FILE_TEXT_CHARS,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_IMAGES_PER_REQUEST,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
} from "@/lib/constants";
import type { ApiContentPart, ApiMessage, Attachment, Message } from "@/lib/types";

export type ValidationResult =
  | { ok: true; messages: ApiMessage[] }
  | { ok: false; error: string; status: number };

export function validateMessages(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid request.", status: 400 };
  }

  const messages = (input as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Send a message to start.", status: 400 };
  }

  if (messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      error: "This conversation is too long to send. Start a new chat.",
      status: 400,
    };
  }

  const sanitized: ApiMessage[] = [];
  let total = 0;
  let images = 0;

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;

    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    if (role === "assistant") {
      if (typeof content !== "string") {
        return { ok: false, error: "Invalid request.", status: 400 };
      }
      const trimmed = content.replace(/\u0000/g, "").trim();
      if (!trimmed) return { ok: false, error: "Send a message to start.", status: 400 };
      if (trimmed.length > MAX_MESSAGE_CHARS) {
        return { ok: false, error: "That message is too long.", status: 400 };
      }
      total += trimmed.length;
      sanitized.push({ role, content: trimmed });
      continue;
    }

    if (typeof content === "string") {
      const trimmed = content.replace(/\u0000/g, "").trim();
      if (!trimmed) return { ok: false, error: "Send a message to start.", status: 400 };
      if (trimmed.length > MAX_USER_CHARS) {
        return { ok: false, error: "That message is too long.", status: 400 };
      }
      total += trimmed.length;
      sanitized.push({ role, content: trimmed });
      continue;
    }

    if (!Array.isArray(content) || content.length === 0 || content.length > MAX_ATTACHMENTS + 1) {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    const parts: ApiContentPart[] = [];
    let textLength = 0;
    let sawImage = false;
    for (const part of content) {
      if (!part || typeof part !== "object") {
        return { ok: false, error: "Invalid request.", status: 400 };
      }
      const type = (part as { type?: unknown }).type;
      if (type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text !== "string") return { ok: false, error: "Invalid request.", status: 400 };
        const trimmed = text.replace(/\u0000/g, "").trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_USER_CHARS) {
          return { ok: false, error: "That message is too long.", status: 400 };
        }
        textLength += trimmed.length;
        parts.push({ type: "text", text: trimmed });
        continue;
      }
      if (type === "image_url") {
        const url = (part as { image_url?: { url?: unknown } }).image_url?.url;
        if (typeof url !== "string" || url.length > MAX_IMAGE_DATA_URL_CHARS || !IMAGE_DATA_URL.test(url)) {
          return { ok: false, error: "That image could not be used.", status: 400 };
        }
        images += 1;
        if (images > MAX_IMAGES_PER_REQUEST) {
          return { ok: false, error: "You can send up to 3 images at a time.", status: 400 };
        }
        sawImage = true;
        parts.push({ type: "image_url", image_url: { url } });
        continue;
      }
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    if (!sawImage || textLength === 0) {
      return { ok: false, error: "Send a message to start.", status: 400 };
    }
    total += textLength;
    sanitized.push({ role, content: parts });
  }

  if (total > MAX_TOTAL_CHARS) {
    return {
      ok: false,
      error: "This conversation is too long to send. Start a new chat.",
      status: 400,
    };
  }

  if (sanitized[sanitized.length - 1]?.role !== "user") {
    return { ok: false, error: "Invalid request.", status: 400 };
  }

  return { ok: true, messages: sanitized };
}

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_USER_CHARS = MAX_MESSAGE_CHARS + MAX_FILE_TEXT_CHARS * MAX_ATTACHMENTS;

function clipPrompt(text: string) {
  return text.length <= MAX_USER_CHARS ? text : text.slice(0, MAX_USER_CHARS);
}

export function sanitizeMessage(value: unknown): Message | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<Message>;
  if (typeof message.id !== "string") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.content !== "string" || typeof message.createdAt !== "number") return null;

  const attachments =
    message.role === "user" ? sanitizeAttachments(message.attachments) : [];

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(attachments.length ? { attachments } : {}),
  };
}

export function toApiMessages(messages: Message[]): ApiMessage[] {
  const imageIds = messages.flatMap((message) =>
    (message.attachments ?? [])
      .filter((attachment) => attachment.kind === "image" && attachment.dataUrl)
      .map((attachment) => attachment.id),
  );
  const visibleImages = new Set(imageIds.slice(-MAX_IMAGES_PER_REQUEST));

  return messages.map((message) => {
    if (message.role === "assistant" || !message.attachments?.length) {
      return { role: message.role, content: message.content };
    }

    const blocks: string[] = [];
    if (message.content.trim()) blocks.push(message.content.trim());

    const images: ApiContentPart[] = [];
    for (const attachment of message.attachments) {
      if (attachment.kind === "file" && attachment.text?.trim()) {
        blocks.push(`Attached file ${attachment.name}:\n${attachment.text.trim()}`);
        continue;
      }
      if (attachment.kind === "image" && attachment.dataUrl && visibleImages.has(attachment.id)) {
        images.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
        continue;
      }
      if (attachment.kind === "image") blocks.push(`[Image: ${attachment.name}]`);
    }

    const text = clipPrompt(blocks.join("\n\n") || "Look at the attached image.");
    if (!images.length) return { role: "user", content: text };
    return {
      role: "user",
      content: [{ type: "text", text }, ...images],
    };
  });
}

function sanitizeAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: Attachment[] = [];
  for (const entry of value) {
    if (attachments.length >= MAX_ATTACHMENTS) break;
    const attachment = sanitizeAttachment(entry);
    if (attachment) attachments.push(attachment);
  }
  return attachments;
}

function sanitizeAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== "object") return null;
  const attachment = value as Partial<Attachment>;
  if (typeof attachment.id !== "string" || typeof attachment.name !== "string") return null;
  if (attachment.kind !== "image" && attachment.kind !== "file") return null;
  if (typeof attachment.mime !== "string") return null;

  const name = attachment.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
  if (!name) return null;

  if (attachment.kind === "image") {
    if (typeof attachment.dataUrl !== "string") return null;
    if (
      attachment.dataUrl.length > MAX_IMAGE_DATA_URL_CHARS ||
      !IMAGE_DATA_URL.test(attachment.dataUrl)
    ) {
      return null;
    }
    return {
      id: attachment.id,
      name,
      mime: "image/jpeg",
      kind: "image",
      dataUrl: attachment.dataUrl,
    };
  }

  if (typeof attachment.text !== "string") return null;
  const text = attachment.text.replace(/\u0000/g, "").trim().slice(0, MAX_FILE_TEXT_CHARS + 20);
  if (!text) return null;
  return {
    id: attachment.id,
    name,
    mime: attachment.mime.slice(0, 120) || "text/plain",
    kind: "file",
    text,
  };
}
