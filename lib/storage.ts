import { scheduleCloudSync } from "@/lib/cloud";
import { MAX_STORED_CONVERSATIONS, STORAGE_KEY } from "@/lib/constants";
import { sanitizeMessage } from "@/lib/messages";
import type { Attachment, ChatState, Conversation, Message } from "@/lib/types";
import { titleFrom } from "@/lib/utils";

export type { ChatState };

const EMPTY: ChatState = { conversations: [], activeId: null };

let cachedRaw: string | null = null;
let cachedState: ChatState = EMPTY;

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Conversation;
  if (
    typeof conversation.id !== "string" ||
    typeof conversation.title !== "string" ||
    typeof conversation.createdAt !== "number" ||
    typeof conversation.updatedAt !== "number" ||
    !Array.isArray(conversation.messages)
  ) {
    return false;
  }

  const messages = conversation.messages
    .map((message) => sanitizeMessage(message))
    .filter((message): message is Message => message !== null);
  if (messages.length !== conversation.messages.length) return false;
  conversation.messages = messages;
  return true;
}

function parse(raw: string): ChatState {
  if (!raw) return EMPTY;

  try {
    const parsed = JSON.parse(raw) as {
      conversations?: unknown;
      activeId?: unknown;
    };
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.filter(isConversation).slice(0, MAX_STORED_CONVERSATIONS)
      : [];
    const activeId =
      typeof parsed.activeId === "string" &&
      conversations.some((conversation) => conversation.id === parsed.activeId)
        ? parsed.activeId
        : null;

    if (conversations.length === 0 && activeId === null) return EMPTY;
    return { conversations, activeId };
  } catch {
    return EMPTY;
  }
}

function commit(next: ChatState) {
  const state: ChatState = {
    conversations: next.conversations.slice(0, MAX_STORED_CONVERSATIONS),
    activeId: next.activeId,
  };
  const raw = JSON.stringify(state);

  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
  } catch {
    const smaller: ChatState = {
      conversations: state.conversations.slice(0, 8),
      activeId: state.activeId,
    };
    try {
      const fallback = JSON.stringify(smaller);
      window.localStorage.setItem(STORAGE_KEY, fallback);
      cachedRaw = fallback;
      cachedState = smaller;
      window.dispatchEvent(new Event("aibay-chat"));
      scheduleCloudSync(smaller);
      return;
    } catch {
      cachedRaw = window.localStorage.getItem(STORAGE_KEY);
    }
  }

  cachedState = state;
  window.dispatchEvent(new Event("aibay-chat"));
  scheduleCloudSync(state);
}

export function subscribe(onChange: () => void) {
  window.addEventListener("aibay-chat", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("aibay-chat", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getSnapshot(): ChatState {
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  cachedState = parse(raw);
  return cachedState;
}

export function getServerSnapshot(): ChatState {
  return EMPTY;
}

export function replaceState(state: ChatState) {
  commit(state);
}

export function activateConversation(id: string | null) {
  const current = getSnapshot();
  if (current.activeId === id) return;
  commit({ ...current, activeId: id });
}

export function removeConversation(id: string) {
  const current = getSnapshot();
  commit({
    conversations: current.conversations.filter((conversation) => conversation.id !== id),
    activeId: current.activeId === id ? null : current.activeId,
  });
}

export function clearConversations() {
  commit(EMPTY);
}

export function patchAssistant(conversationId: string, messageId: string, content: string) {
  const current = getSnapshot();
  commit({
    ...current,
    conversations: current.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) =>
              message.id === messageId ? { ...message, content } : message,
            ),
          }
        : conversation,
    ),
  });
}

export function dropAssistant(conversationId: string, messageId: string) {
  const current = getSnapshot();
  commit({
    ...current,
    conversations: current.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: conversation.messages.filter((message) => message.id !== messageId),
          }
        : conversation,
    ),
  });
}

export function startExchange(content: string, attachments: Attachment[] = []) {
  const current = getSnapshot();
  const now = Date.now();
  const existing =
    current.conversations.find((conversation) => conversation.id === current.activeId) ?? null;
  const conversationId = existing?.id ?? crypto.randomUUID();
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: now,
    ...(attachments.length ? { attachments } : {}),
  };
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    createdAt: now,
  };
  const history = [...(existing?.messages ?? []), userMessage];
  const nextConversation: Conversation = {
    id: conversationId,
    title:
      existing && existing.messages.some((message) => message.role === "user")
        ? existing.title
        : titleFrom(content || attachments[0]?.name || ""),
    messages: [...history, assistantMessage],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  commit({
    activeId: conversationId,
    conversations: [
      nextConversation,
      ...current.conversations.filter((conversation) => conversation.id !== conversationId),
    ],
  });

  return {
    conversationId,
    assistantId: assistantMessage.id,
    history,
  };
}

export function beginRetry(conversationId: string) {
  const current = getSnapshot();
  const conversation = current.conversations.find((item) => item.id === conversationId);
  if (!conversation) return null;

  const kept = conversation.messages.filter(
    (message) => message.role === "user" || message.content.trim().length > 0,
  );
  let lastUserIndex = -1;
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    if (kept[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) return null;

  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    createdAt: Date.now(),
  };
  const base =
    conversation.messages[conversation.messages.length - 1]?.role === "assistant"
      ? conversation.messages.slice(0, -1)
      : conversation.messages;

  commit({
    ...current,
    conversations: current.conversations.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            updatedAt: Date.now(),
            messages: [...base, assistantMessage],
          }
        : item,
    ),
  });

  return {
    assistantId: assistantMessage.id,
    history: kept.slice(0, lastUserIndex + 1),
  };
}
