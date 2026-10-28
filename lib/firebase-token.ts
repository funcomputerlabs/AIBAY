import "server-only";

import { isOwnerEmail } from "@/lib/owner";

export async function isOwnerRequest(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return false;
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!key) return false;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return false;
    const payload = (await response.json()) as { users?: Array<{ email?: string }> };
    return isOwnerEmail(payload.users?.[0]?.email);
  } catch {
    return false;
  }
}
