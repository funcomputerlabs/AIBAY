import {
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
} from "@/lib/constants";
import type { ApiMessage } from "@/lib/types";

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

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;

    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    if (typeof content !== "string") {
      return { ok: false, error: "Invalid request.", status: 400 };
    }

    const trimmed = content.replace(/\u0000/g, "").trim();
    if (!trimmed) {
      return { ok: false, error: "Send a message to start.", status: 400 };
    }

    if (trimmed.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: "That message is too long.", status: 400 };
    }

    total += trimmed.length;
    sanitized.push({ role, content: trimmed });
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
