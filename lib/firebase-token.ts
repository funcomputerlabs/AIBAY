import "server-only";

export type SignedInUser = {
  uid: string;
  email: string;
};

export async function lookupFirebaseUser(authorization: string | null): Promise<SignedInUser | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!key) return null;

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
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      users?: Array<{ localId?: string; email?: string }>;
    };
    const user = payload.users?.[0];
    const uid = user?.localId?.trim() ?? "";
    const email = user?.email?.trim() ?? "";
    if (!uid || !email) return null;
    return { uid, email };
  } catch {
    return null;
  }
}
