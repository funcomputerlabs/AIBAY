export const STORAGE_KEY = "aibay.conversations.v1";

export const MAX_MESSAGE_CHARS = 12_000;
export const MAX_MESSAGES = 40;
export const MAX_TOTAL_CHARS = 80_000;
export const MAX_BODY_BYTES = 200_000;
export const MAX_STORED_CONVERSATIONS = 50;

/** Production Groq chat model. Override with GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export const SUGGESTIONS = [
  "Explain quantum computing simply",
  "Help me write a website",
  "Analyze this text",
] as const;
