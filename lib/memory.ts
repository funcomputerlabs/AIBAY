"use client";

import { useSyncExternalStore } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { MAX_MEMORY_CHARS } from "@/lib/constants";
import { getFirebase } from "@/lib/firebase";
import type { Locale } from "@/lib/locale";

const STORAGE_KEY = "aibay.memory.v1";
const MAX_ACCOUNTS = 8;

export type MemoryState = {
  enabled: boolean;
  text: string;
  updatedAt: number;
};

const EMPTY: MemoryState = { enabled: false, text: "", updatedAt: 0 };

let userId: string | null = null;
let snapshot: MemoryState = EMPTY;
let revision = 0;
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(next: MemoryState) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getMemorySnapshot() {
  return snapshot;
}

export function getServerMemorySnapshot(): MemoryState {
  return EMPTY;
}

export function useMemory() {
  return useSyncExternalStore(subscribe, getMemorySnapshot, getServerMemorySnapshot);
}

export function setMemoryUser(uid: string | null) {
  userId = uid;
  revision += 1;
  publish(uid ? readEntry(uid) : EMPTY);
}

export function isMemoryEnabled() {
  return Boolean(userId) && snapshot.enabled;
}

export function getMemoryText() {
  return userId && snapshot.enabled ? snapshot.text : "";
}

export async function loadMemoryFromAccount() {
  const uid = userId;
  const seen = revision;
  const firebase = getFirebase();
  if (!uid || !firebase) return;

  try {
    const remoteDoc = await getDoc(doc(firebase.db, "users", uid, "settings", "memory"));
    if (userId !== uid || seen !== revision) return;
    const remote = toState(remoteDoc.data());
    if (!remote) return;
    const local = readEntry(uid);
    if (remote.updatedAt >= local.updatedAt) save(uid, remote);
    else void push(uid, local);
  } catch {
    /* this device keeps the last saved notes */
  }
}

export function setMemoryEnabled(enabled: boolean) {
  const uid = userId;
  if (!uid) return;
  const current = readEntry(uid);
  if (current.enabled === enabled) return;
  save(uid, { ...current, enabled, updatedAt: Date.now() });
}

export function clearMemory() {
  const uid = userId;
  if (!uid) return;
  const current = readEntry(uid);
  save(uid, { ...current, text: "", updatedAt: Date.now() });
}

export function noteExchange(person: string, reply: string, locale: Locale) {
  if (!userId || !snapshot.enabled) return;
  const said = clip(person, 2_000);
  const answer = clip(reply, 2_000);
  if (!said) return;
  queue = queue.then(() => revise(said, answer, locale), () => revise(said, answer, locale));
}

async function revise(person: string, reply: string, locale: Locale) {
  const uid = userId;
  if (!uid || !readEntry(uid).enabled) return;
  const token = await idToken();
  if (!token || userId !== uid) return;

  try {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        memory: readEntry(uid).text,
        user: person,
        assistant: reply,
        locale,
      }),
    });
    if (!response.ok || userId !== uid || !readEntry(uid).enabled) return;
    const data = (await response.json()) as { text?: unknown };
    if (typeof data.text !== "string") return;
    const text = data.text.replace(/\u0000/g, "").trim().slice(0, MAX_MEMORY_CHARS);
    const current = readEntry(uid);
    if (text === current.text) return;
    save(uid, { ...current, text, updatedAt: Date.now() });
  } catch {
    /* keep the notes already saved */
  }
}

async function idToken() {
  const user = getFirebase()?.auth.currentUser;
  if (!user || user.uid !== userId) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

function save(uid: string, entry: MemoryState) {
  revision += 1;
  const store = readStore();
  store[uid] = {
    enabled: entry.enabled,
    text: entry.text.slice(0, MAX_MEMORY_CHARS),
    updatedAt: entry.updatedAt,
  };
  const ids = Object.keys(store);
  if (ids.length > MAX_ACCOUNTS) {
    ids
      .sort((a, b) => store[a].updatedAt - store[b].updatedAt)
      .slice(0, ids.length - MAX_ACCOUNTS)
      .forEach((id) => {
        delete store[id];
      });
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* the account copy still updates */
  }
  if (userId === uid) publish(store[uid]);
  void push(uid, store[uid]);
}

async function push(uid: string, entry: MemoryState) {
  const firebase = getFirebase();
  const user = firebase?.auth.currentUser;
  if (!firebase || !user || user.uid !== uid) return;
  try {
    await setDoc(doc(firebase.db, "users", uid, "settings", "memory"), {
      enabled: entry.enabled,
      text: entry.text,
      updatedAt: entry.updatedAt,
    });
  } catch {
    /* this device keeps the notes */
  }
}

function readEntry(uid: string): MemoryState {
  return readStore()[uid] ?? EMPTY;
}

function readStore(): Record<string, MemoryState> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const store: Record<string, MemoryState> = {};
    for (const [uid, value] of Object.entries(parsed)) {
      const entry = toState(value);
      if (entry) store[uid] = entry;
    }
    return store;
  } catch {
    return {};
  }
}

function toState(value: unknown): MemoryState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<MemoryState>;
  if (typeof data.enabled !== "boolean") return null;
  if (typeof data.text !== "string" || typeof data.updatedAt !== "number") return null;
  return {
    enabled: data.enabled,
    text: data.text.replace(/\u0000/g, "").slice(0, MAX_MEMORY_CHARS),
    updatedAt: data.updatedAt,
  };
}

function clip(value: string, max: number) {
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}
