"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { isOwnerEmail } from "@/lib/owner";

const STORAGE_KEY = "aibay.improve.v1";
const MAX_IMPROVE_CHARS = 8_000;

type ImproveState = {
  text: string;
  updatedAt: number;
};

const EMPTY: ImproveState = { text: "", updatedAt: 0 };
let cached: ImproveState | null = null;

function read(): ImproveState {
  if (cached) return cached;
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "") as Partial<ImproveState>;
    if (typeof parsed.text === "string" && typeof parsed.updatedAt === "number") {
      cached = { text: parsed.text.slice(0, MAX_IMPROVE_CHARS), updatedAt: parsed.updatedAt };
      return cached;
    }
  } catch {
    /* keep empty */
  }
  cached = EMPTY;
  return cached;
}

function write(next: ImproveState) {
  cached = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getImproveText() {
  return read().text;
}

export function appendImprove(line: string) {
  const item = line.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (!item) return getImproveText();
  const current = read();
  if (current.text.split("\n").includes(item)) return current.text;
  const text = [current.text, item].filter(Boolean).join("\n").slice(-MAX_IMPROVE_CHARS);
  write({ text, updatedAt: Date.now() });
  void pushImprove(text);
  return text;
}

export async function loadImproveFromAccount() {
  const firebase = getFirebase();
  const user = firebase?.auth.currentUser;
  if (!firebase || !user || !isOwnerEmail(user.email)) return;
  try {
    const [global, personal] = await Promise.all([
      getDoc(doc(firebase.db, "config", "improve")),
      getDoc(doc(firebase.db, "users", user.uid, "settings", "improve")),
    ]);
    const remote = newer(toState(global.data()), toState(personal.data()));
    const local = read();
    if (remote && remote.updatedAt >= local.updatedAt) write(remote);
    const text = getImproveText();
    if (text) void pushImprove(text);
  } catch {
    /* keep local rules */
  }
}

async function pushImprove(text: string) {
  const firebase = getFirebase();
  const user = firebase?.auth.currentUser;
  if (!firebase || !user || !isOwnerEmail(user.email)) return;
  const payload = { text, updatedAt: Date.now() };
  try {
    await Promise.all([
      setDoc(doc(firebase.db, "config", "improve"), payload),
      setDoc(doc(firebase.db, "users", user.uid, "settings", "improve"), payload),
    ]);
  } catch {
    try {
      await setDoc(doc(firebase.db, "users", user.uid, "settings", "improve"), payload);
    } catch {
      /* local rules still apply */
    }
  }
}

function toState(value: unknown): ImproveState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<ImproveState>;
  if (typeof data.text !== "string" || typeof data.updatedAt !== "number") return null;
  return { text: data.text.slice(0, MAX_IMPROVE_CHARS), updatedAt: data.updatedAt };
}

function newer(left: ImproveState | null, right: ImproveState | null) {
  if (!left) return right;
  if (!right) return left;
  return left.updatedAt >= right.updatedAt ? left : right;
}
