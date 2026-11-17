import "server-only";

import { MAX_MEMORY_CHARS } from "@/lib/constants";

type RemoteMemory = {
  enabled: boolean;
  text: string;
  updatedAt: number;
};

/** Load account memory from Firestore with the caller's Firebase ID token. */
export async function loadAccountMemory(
  uid: string,
  idToken: string,
): Promise<RemoteMemory | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId || !uid || !idToken) return null;

  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/databases/(default)/documents/users/${encodeURIComponent(uid)}/settings/memory`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      fields?: {
        enabled?: { booleanValue?: boolean };
        text?: { stringValue?: string };
        updatedAt?: { integerValue?: string; doubleValue?: number };
      };
    };
    const fields = payload.fields;
    if (!fields) return null;
    const enabled = fields.enabled?.booleanValue;
    const text = fields.text?.stringValue;
    const updatedAt = parseUpdatedAt(fields.updatedAt);
    if (typeof enabled !== "boolean" || typeof text !== "string" || updatedAt === null) {
      return null;
    }
    return {
      enabled,
      text: text.replace(/\u0000/g, "").trim().slice(0, MAX_MEMORY_CHARS),
      updatedAt,
    };
  } catch {
    return null;
  }
}

/** Prefer non-empty client notes; fall back to cloud when the body omitted them. */
export function resolveMemory(clientText: string, remote: RemoteMemory | null) {
  const local = clientText.replace(/\u0000/g, "").trim().slice(0, MAX_MEMORY_CHARS);
  if (!remote?.enabled) return local;
  if (!remote.text) return local;
  if (!local) return remote.text;
  // Same account: keep the longer/newer-feeling client copy when both exist.
  return local.length >= remote.text.length ? local : remote.text;
}

function parseUpdatedAt(
  value: { integerValue?: string; doubleValue?: number } | undefined,
): number | null {
  if (!value) return null;
  if (typeof value.doubleValue === "number" && Number.isFinite(value.doubleValue)) {
    return value.doubleValue;
  }
  if (typeof value.integerValue === "string") {
    const parsed = Number(value.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
