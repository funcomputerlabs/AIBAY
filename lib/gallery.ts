"use client";

import { useSyncExternalStore } from "react";
import type { Conversation } from "@/lib/types";

export type GalleryKind = "image" | "video" | "audio";

export type GalleryItem = {
  id: string;
  kind: GalleryKind;
  name: string;
  mime: string;
  prompt: string;
  createdAt: number;
  dataUrl?: string;
  url?: string;
};

type GalleryState = {
  ready: boolean;
  items: GalleryItem[];
};

const EMPTY: GalleryState = { ready: false, items: [] };
const SERVER: GalleryState = { ready: true, items: [] };
const MAX_ITEMS = 100;

let state: GalleryState = EMPTY;
let opening: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function emit(next: GalleryState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeGallery(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGallerySnapshot() {
  return state;
}

export function getGalleryServerSnapshot() {
  return SERVER;
}

export function useGallery() {
  return useSyncExternalStore(subscribeGallery, getGallerySnapshot, getGalleryServerSnapshot);
}

export function seedGallery(conversations: Conversation[]) {
  return enqueue(async () => {
    await ensureOpen();
    const incoming = collect(conversations).filter((item) => !state.items.some((saved) => saved.id === item.id));
    if (!incoming.length) return;
    const items = [...incoming, ...state.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS);
    await writeAll(items);
    emit({ ready: true, items });
  });
}

export function removeGalleryItem(id: string) {
  return enqueue(async () => {
    await ensureOpen();
    const items = state.items.filter((item) => item.id !== id);
    await deleteItem(id);
    emit({ ready: true, items });
  });
}

function enqueue(task: () => Promise<void>) {
  queue = queue.then(task, task);
  return queue;
}

function collect(conversations: Conversation[]) {
  const found: GalleryItem[] = [];
  for (const conversation of conversations) {
    for (let index = 0; index < conversation.messages.length; index += 1) {
      const message = conversation.messages[index];
      if (message.role !== "assistant" || !message.attachments?.length) continue;
      const prompt =
        [...conversation.messages.slice(0, index)].reverse().find((entry) => entry.role === "user")?.content ?? "";
      for (const attachment of message.attachments) {
        const item = toItem(attachment, prompt, message.createdAt);
        if (item) found.push(item);
      }
    }
  }
  return found;
}

function toItem(
  attachment: { id: string; name: string; mime: string; kind: string; dataUrl?: string; url?: string },
  prompt: string,
  createdAt: number,
): GalleryItem | null {
  const text = prompt.replace(/\s+/g, " ").trim().slice(0, 500);
  if (attachment.kind === "image" && attachment.dataUrl?.startsWith("data:image/")) {
    return {
      id: attachment.id,
      kind: "image",
      name: attachment.name || "aibay.jpg",
      mime: "image/jpeg",
      prompt: text,
      createdAt,
      dataUrl: attachment.dataUrl,
    };
  }
  if ((attachment.kind === "video" || attachment.kind === "audio") && attachment.url?.startsWith("https://")) {
    return {
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name || (attachment.kind === "video" ? "aibay.mp4" : "aibay.mp3"),
      mime: attachment.mime,
      prompt: text,
      createdAt,
      url: attachment.url,
    };
  }
  return null;
}

function ensureOpen() {
  if (state.ready) return Promise.resolve();
  if (!opening) opening = load();
  return opening;
}

async function load() {
  if (typeof indexedDB === "undefined") {
    emit({ ready: true, items: [] });
    return;
  }
  const db = await openDb();
  const items = (await readAll(db)).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS);
  emit({ ready: true, items });
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("aibay", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("gallery")) {
        request.result.createObjectStore("gallery", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(db: IDBDatabase) {
  return new Promise<GalleryItem[]>((resolve, reject) => {
    const request = db.transaction("gallery", "readonly").objectStore("gallery").getAll();
    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result.filter(isItem) : [];
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeAll(items: GalleryItem[]) {
  const db = await openDb();
  const existing = await readAll(db);
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("gallery", "readwrite");
    const store = transaction.objectStore("gallery");
    const keep = new Set(items.map((item) => item.id));
    for (const item of existing) {
      if (!keep.has(item.id)) store.delete(item.id);
    }
    for (const item of items) store.put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteItem(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("gallery", "readwrite");
    transaction.objectStore("gallery").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function isItem(value: unknown): value is GalleryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GalleryItem>;
  if (typeof item.id !== "string" || typeof item.createdAt !== "number") return false;
  if (item.kind !== "image" && item.kind !== "video" && item.kind !== "audio") return false;
  if (item.kind === "image") return typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/");
  return typeof item.url === "string" && item.url.startsWith("https://");
}
