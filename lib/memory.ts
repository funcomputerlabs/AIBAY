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
let hydrated = true;
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
  hydrated = !uid;
  publish(uid ? readEntry(uid) : EMPTY);
}

export function isMemoryEnabled() {
  if (!userId) return false;
  return refreshFromDisk(userId).enabled;
}

export function getMemoryText() {
  if (!userId) return "";
  const entry = refreshFromDisk(userId);
  return entry.enabled ? entry.text : "";
}

/** Prefer disk over an in-memory snapshot that can go stale across HMR/tabs. */
function refreshFromDisk(uid: string) {
  const entry = readEntry(uid);
  if (
    entry.enabled !== snapshot.enabled ||
    entry.text !== snapshot.text ||
    entry.updatedAt !== snapshot.updatedAt
  ) {
    publish(entry);
  }
  return entry;
}

/** Wait until pending memory revisions finish so the next chat sees fresh notes. */
export async function awaitMemoryIdle() {
  const pending = queue;
  await pending;
  if (queue !== pending) await queue;
}

export async function loadMemoryFromAccount() {
  const uid = userId;
  const seen = revision;
  const firebase = getFirebase();
  if (!uid || !firebase) {
    hydrated = true;
    return;
  }

  try {
    const remoteDoc = await getDoc(doc(firebase.db, "users", uid, "settings", "memory"));
    if (userId !== uid || seen !== revision) return;
    const remote = toState(remoteDoc.data());
    const local = readEntry(uid);
    const next = mergeMemory(local, remote);
    if (next) {
      writeLocal(uid, next);
      if (userId === uid && seen === revision) publish(next);
      // Only push when local clearly wins and remote exists or local has content.
      if (!remote || localWins(local, remote)) {
        if (local.text || local.enabled) void push(uid, next);
      }
    }
  } catch {
    /* this device keeps the last saved notes */
  } finally {
    if (userId === uid && seen === revision) hydrated = true;
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
  writeLocal(uid, entry);
  if (userId === uid) publish(entry);
  // Avoid pushing empty local over cloud notes before first load finishes.
  if (!hydrated && !entry.text && entry.enabled) return;
  void push(uid, entry);
}

function writeLocal(uid: string, entry: MemoryState) {
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

function mergeMemory(local: MemoryState, remote: MemoryState | null): MemoryState | null {
  if (!remote) return local.updatedAt || local.text || local.enabled ? local : null;
  if (remote.updatedAt > local.updatedAt) {
    // Keep local enable flip if user toggled while loading, but never lose richer remote text.
    if (local.updatedAt > 0 && local.enabled !== remote.enabled && !local.text && remote.text) {
      return { ...remote, enabled: local.enabled, updatedAt: Math.max(local.updatedAt, remote.updatedAt) };
    }
    return remote;
  }
  if (local.updatedAt > remote.updatedAt) {
    // Never overwrite non-empty remote with empty newer local (toggle / race).
    if (!local.text && remote.text) {
      return {
        enabled: local.enabled,
        text: remote.text,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      };
    }
    return local;
  }
  // Same timestamp: prefer non-empty text and enabled if either side has it.
  return {
    enabled: local.enabled || remote.enabled,
    text: local.text.length >= remote.text.length ? local.text : remote.text,
    updatedAt: local.updatedAt,
  };
}

function localWins(local: MemoryState, remote: MemoryState) {
  if (local.updatedAt <= remote.updatedAt) return false;
  if (!local.text && remote.text) return false;
  return true;
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
