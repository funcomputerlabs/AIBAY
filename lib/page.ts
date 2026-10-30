import type { PageContext, PageField } from "@/lib/types";

export function readPageContext(value: unknown): PageContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Partial<PageContext>;
  if (typeof data.url !== "string" || typeof data.title !== "string") return undefined;
  const url = data.url.replace(/\u0000/g, "").trim().slice(0, 500);
  if (!/^https?:\/\//i.test(url)) return undefined;
  const title = data.title.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  const text =
    typeof data.text === "string" ? data.text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 6_000) : "";
  if (!Array.isArray(data.fields)) return { url, title, text, fields: [] };
  const fields: PageField[] = [];
  for (const entry of data.fields.slice(0, 80)) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Partial<PageField>;
    if (typeof field.id !== "number" || !Number.isInteger(field.id) || field.id < 1) continue;
    fields.push({
      id: field.id,
      tag: String(field.tag || "input").toLowerCase().slice(0, 20),
      type: String(field.type || "text").toLowerCase().slice(0, 30),
      label: String(field.label || "").replace(/\s+/g, " ").trim().slice(0, 120),
      value: field.type === "password" ? "" : String(field.value || "").slice(0, 200),
    });
  }
  return { url, title, text, fields };
}
