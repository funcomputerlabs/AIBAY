export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function titleFrom(content: string) {
  const line = content.replace(/\s+/g, " ").trim();
  if (line.length <= 48) return line || "New chat";
  return `${line.slice(0, 47).trimEnd()}…`;
}

export function formatWhen(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function createId() {
  return crypto.randomUUID();
}
