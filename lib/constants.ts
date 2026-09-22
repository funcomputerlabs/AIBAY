export const STORAGE_KEY = "aibay.conversations.v1";

export const MAX_MESSAGE_CHARS = 12_000;
export const MAX_MESSAGES = 40;
export const MAX_TOTAL_CHARS = 80_000;
export const MAX_BODY_BYTES = 4_000_000;
export const MAX_STORED_CONVERSATIONS = 50;

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGES_PER_REQUEST = 3;
export const MAX_ATTACHMENT_BYTES = 8_000_000;
export const MAX_IMAGE_DATA_URL_CHARS = 1_200_000;
export const MAX_FILE_TEXT_CHARS = 12_000;

/** Production Groq chat model. Override with GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
/** Used only when a message includes an image. The default chat model is text-only. */
export const VISION_GROQ_MODEL = "qwen/qwen3.8-27b";

export const SUGGESTIONS = [
  "Explain quantum computing simply",
  "Help me write a website",
  "Analyze this text",
] as const;
