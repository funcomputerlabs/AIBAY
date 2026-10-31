import "server-only";

import Groq from "groq-sdk";
import { isGroqConfigured, toPublicError } from "@/lib/groq";
import type { Locale } from "@/lib/locale";

const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
const SPEECH_MODEL = "canopylabs/orpheus-v1-english";
const SPEECH_VOICE = "hannah";

export function assertVoiceReady() {
  if (!isGroqConfigured()) {
    const error = new Error("unavailable");
    (error as Error & { status: number }).status = 503;
    throw error;
  }
}

export async function transcribeAudio(file: File, locale: Locale) {
  assertVoiceReady();
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim() });
  const result = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    language: locale,
    response_format: "text",
    temperature: 0,
  });
  const text = typeof result === "string" ? result : String(result);
  return text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 4_000);
}

export async function speakEnglish(text: string) {
  assertVoiceReady();
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim() });
  const speech = await client.audio.speech.create({
    model: SPEECH_MODEL,
    voice: SPEECH_VOICE,
    input: text.replace(/\u0000/g, "").trim().slice(0, 1_200),
    response_format: "wav",
  });
  return Buffer.from(await speech.arrayBuffer());
}

export { toPublicError };
