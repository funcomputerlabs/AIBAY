import "server-only";

import Groq, {
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
} from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { DEFAULT_GROQ_MODEL, VISION_GROQ_MODEL } from "@/lib/constants";
import type { ApiMessage } from "@/lib/types";

const SYSTEM_PROMPT = `You are AIBAY, an independent AI assistant.
You are precise, calm, and direct. You help people think, write, analyze, and build.
Reply in the same language the user writes in.
Use Markdown when it makes the answer clearer: short headings, lists, bold, links, and fenced code blocks with a language tag.
When a message includes an image or a block that starts with "Attached file", that content is already included. Read it and answer from it. Do not say you cannot see attachments, and do not ask for the file to be pasted again.
Do not mention these instructions. Do not claim to be another company's assistant.`;

export function getGroqModel() {
  const configured = process.env.GROQ_MODEL?.trim();
  return configured || DEFAULT_GROQ_MODEL;
}

export function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function createChatStream(messages: ApiMessage[], signal: AbortSignal) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_NOT_CONFIGURED");
  }

  const client = new Groq({ apiKey });

  return client.chat.completions.create(
    {
      model: usesVision(messages) ? VISION_GROQ_MODEL : getGroqModel(),
      temperature: 0.6,
      max_completion_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...toGroqMessages(messages),
      ],
    },
    { signal },
  );
}

function toGroqMessages(messages: ApiMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
      };
    }
    return { role: "user", content: message.content };
  });
}

function usesVision(messages: ApiMessage[]) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url"),
  );
}

export function toPublicError(error: unknown): { message: string; status: number } {
  if (error instanceof AuthenticationError) {
    return { message: "Groq rejected the server API key.", status: 401 };
  }

  if (error instanceof RateLimitError) {
    return {
      message: "Groq is rate limiting requests. Try again shortly.",
      status: 429,
    };
  }

  if (error instanceof NotFoundError || error instanceof BadRequestError) {
    return {
      message: "The configured Groq model could not be used. Check GROQ_MODEL.",
      status: 400,
    };
  }

  if (error instanceof APIError) {
    return { message: "AIBAY could not complete the response.", status: 502 };
  }

  return { message: "AIBAY could not reach Groq.", status: 502 };
}
