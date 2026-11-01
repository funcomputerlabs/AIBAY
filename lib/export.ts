import type { Conversation } from "@/lib/types";

export function conversationMarkdown(conversation: Conversation) {
  const lines = [`# ${conversation.title}`, ""];
  for (const message of conversation.messages) {
    if (!message.content.trim() && !message.attachments?.length) continue;
    lines.push(message.role === "user" ? "## You" : "## AIBAY");
    if (message.content.trim()) lines.push(message.content.trim());
    for (const attachment of message.attachments ?? []) {
      if (attachment.kind === "file" && attachment.text) {
        lines.push(`\nAttached file ${attachment.name}:\n${attachment.text}`);
      } else {
        lines.push(`[${attachment.kind}: ${attachment.name}]`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function allConversationsMarkdown(conversations: Conversation[]) {
  return conversations
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((conversation) => conversationMarkdown(conversation))
    .join("\n---\n\n");
}
