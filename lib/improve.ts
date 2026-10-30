"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";

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
  if (!firebase || !user) return;
  try {
    const snapshot = await getDoc(doc(firebase.db, "users", user.uid, "settings", "improve"));
    if (!snapshot.exists()) return;
    const data = snapshot.data() as Partial<ImproveState>;
    if (typeof data.text !== "string" || typeof data.updatedAt !== "number") return;
    const local = read();
    if (data.updatedAt >= local.updatedAt) {
      write({ text: data.text.slice(0, MAX_IMPROVE_CHARS), updatedAt: data.updatedAt });
    }
  } catch {
    /* keep local rules */
  }
}

async function pushImprove(text: string) {
  const firebase = getFirebase();
  const user = firebase?.auth.currentUser;
  if (!firebase || !user) return;
  try {
    await setDoc(doc(firebase.db, "users", user.uid, "settings", "improve"), {
      text,
      updatedAt: Date.now(),
    });
  } catch {
    /* local rules still apply */
  }
}
