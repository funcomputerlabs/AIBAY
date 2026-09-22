import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import type { ChatState, Conversation, Message } from "@/lib/types";

let cloudUserId: string | null = null;
let timer: number | null = null;
let pending: ChatState | null = null;
let knownIds = new Set<string>();

export function setCloudUser(userId: string | null) {
  cloudUserId = userId;
  if (!userId) {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    pending = null;
    knownIds = new Set();
  }
}

export function scheduleCloudSync(state: ChatState) {
  if (!cloudUserId) return;
  pending = state;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    const next = pending;
    pending = null;
    if (next && cloudUserId) {
      void pushCloud(cloudUserId, next).catch(() => {
        window.dispatchEvent(new Event("aibay-cloud-warning"));
      });
    }
  }, 800);
}

export async function flushCloudSync() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  const next = pending;
  pending = null;
  if (next && cloudUserId) {
    try {
      await pushCloud(cloudUserId, next);
    } catch {
      window.dispatchEvent(new Event("aibay-cloud-warning"));
    }
  }
}

export async function loadCloudConversations(userId: string): Promise<Conversation[]> {
  const firebase = getFirebase();
  if (!firebase) return [];

  const snapshot = await getDocs(collection(firebase.db, "users", userId, "conversations"));
  const conversations: Conversation[] = [];
  knownIds = new Set();

  for (const item of snapshot.docs) {
    const conversation = toConversation(item.id, item.data());
    if (!conversation) continue;
    knownIds.add(item.id);
    conversations.push(conversation);
  }

  return conversations;
}

async function pushCloud(userId: string, state: ChatState) {
  const firebase = getFirebase();
  if (!firebase) return;

  const batch = writeBatch(firebase.db);
  const nextIds = new Set(state.conversations.map((conversation) => conversation.id));
  let operations = 0;

  for (const id of knownIds) {
    if (!nextIds.has(id)) {
      batch.delete(doc(firebase.db, "users", userId, "conversations", id));
      operations += 1;
    }
  }

  for (const conversation of state.conversations) {
    batch.set(doc(firebase.db, "users", userId, "conversations", conversation.id), {
      title: conversation.title,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
    operations += 1;
  }

  if (operations === 0) return;

  await batch.commit();
  knownIds = nextIds;
}

function toConversation(id: string, value: unknown): Conversation | null {
  if (!value || typeof value !== "object" || !id) return null;
  const data = value as Partial<Conversation>;
  if (typeof data.title !== "string") return null;
  if (typeof data.createdAt !== "number" || typeof data.updatedAt !== "number") return null;
  if (!Array.isArray(data.messages) || !data.messages.every(isMessage)) return null;

  return {
    id,
    title: data.title,
    messages: data.messages,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Message;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "number"
  );
}
