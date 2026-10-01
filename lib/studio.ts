import "server-only";

const VIDEO_URL = "https://api.magichour.ai/v1/text-to-video";
const VIDEO_STATUS = "https://api.magichour.ai/v1/video-projects/";
const MUSIC_URL = "https://api.aimusicapi.ai/api/v1/sonic/create";
const MUSIC_STATUS = "https://api.aimusicapi.ai/api/v1/sonic/task/";

export class StudioError extends Error {
  status: number;
  code: "unavailable" | "failed" | "rate";

  constructor(code: "unavailable" | "failed" | "rate", status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function createMedia(kind: "video" | "music", prompt: string, jobId: string | undefined, signal: AbortSignal) {
  const id = jobId || (await startJob(kind, prompt, signal));
  const ready = await waitForJob(kind, id, signal);
  return ready ? { url: ready, mime: kind === "video" ? "video/mp4" : "audio/mpeg" } : { pending: true as const, jobId: id };
}

async function startJob(kind: "video" | "music", prompt: string, signal: AbortSignal) {
  if (kind === "video") {
    const key = process.env.MAGIC_HOUR_API_KEY?.trim();
    if (!key) throw new StudioError("unavailable", 503);
    const response = await fetch(VIDEO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: "AIBAY",
        end_seconds: 5,
        aspect_ratio: "16:9",
        resolution: "480p",
        style: { prompt: prompt.slice(0, 1_000) },
      }),
      signal,
    });
    return readId(response, "id");
  }

  const key = process.env.SUNO_API_KEY?.trim();
  if (!key) throw new StudioError("unavailable", 503);
  const response = await fetch(MUSIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      custom_mode: false,
      mv: "sonic-v4-5",
      title: "AIBAY",
      tags: "original",
      gpt_description_prompt: prompt.slice(0, 500),
    }),
    signal,
  });
  return readId(response, "task_id");
}

async function readId(response: Response, field: "id" | "task_id") {
  if (response.status === 429) throw new StudioError("rate", 429);
  if (response.status === 401 || response.status === 403) throw new StudioError("unavailable", 503);
  if (!response.ok) {
    console.error("AIBAY media request failed", { status: response.status });
    throw new StudioError("failed", response.status >= 500 ? 502 : 400);
  }
  const payload = (await response.json()) as { id?: string; task_id?: string; data?: { task_id?: string } };
  const id = payload[field] || payload.data?.task_id;
  if (!id) throw new StudioError("failed", 502);
  return id;
}

async function waitForJob(kind: "video" | "music", id: string, signal: AbortSignal) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new StudioError("failed", 499);
    const url = await checkJob(kind, id, signal);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, kind === "video" ? 4_000 : 8_000));
  }
  return null;
}

async function checkJob(kind: "video" | "music", id: string, signal: AbortSignal) {
  if (kind === "video") {
    const key = process.env.MAGIC_HOUR_API_KEY?.trim();
    if (!key) throw new StudioError("unavailable", 503);
    const response = await fetch(`${VIDEO_STATUS}${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal,
    });
    if (!response.ok) throw new StudioError("failed", 502);
    const payload = (await response.json()) as { status?: string; downloads?: Array<{ url?: string }> };
    if (payload.status === "error" || payload.status === "canceled") throw new StudioError("failed", 502);
    const url = payload.downloads?.find((item) => item.url?.startsWith("https://"))?.url;
    return payload.status === "complete" ? url || null : null;
  }

  const key = process.env.SUNO_API_KEY?.trim();
  if (!key) throw new StudioError("unavailable", 503);
  const response = await fetch(`${MUSIC_STATUS}${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal,
  });
  if (response.status === 429) throw new StudioError("rate", 429);
  if (!response.ok) throw new StudioError("failed", 502);
  const payload = (await response.json()) as { data?: { state?: string }; state?: string };
  const state = payload.data?.state || payload.state;
  if (state === "failed") throw new StudioError("failed", 502);
  if (state !== "succeeded") return null;
  const audio = firstHttpsAudio(payload);
  if (!audio) throw new StudioError("failed", 502);
  return audio;
}

function firstHttpsAudio(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpsAudio(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["audio_url", "audioUrl", "stream_audio_url", "url"]) {
    const item = record[key];
    if (typeof item === "string" && item.startsWith("https://")) return item;
  }
  for (const item of Object.values(record)) {
    if (item && typeof item === "object") {
      const found = firstHttpsAudio(item);
      if (found) return found;
    }
  }
  return null;
}
