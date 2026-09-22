import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { flushCloudSync, loadCloudConversations, setCloudUser } from "@/lib/cloud";
import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import { getSnapshot, replaceState } from "@/lib/storage";
import { MAX_STORED_CONVERSATIONS } from "@/lib/constants";
import type { Conversation } from "@/lib/types";

export type AccountState = {
  ready: boolean;
  configured: boolean;
  email: string | null;
  warning: string | null;
};

const INITIAL: AccountState = {
  ready: false,
  configured: false,
  email: null,
  warning: null,
};

let accountState: AccountState = {
  ...INITIAL,
  configured: isFirebaseConfigured(),
};
let started = false;
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: AccountState) {
  accountState = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAccount(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getAccountSnapshot(): AccountState {
  return accountState;
}

export function getServerAccountSnapshot(): AccountState {
  return INITIAL;
}

export function startAccountSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("aibay-cloud-warning", () => {
    if (!accountState.email) return;
    publish({
      ...accountState,
      warning: "Signed in. Chats stay on this device until Firestore is enabled.",
    });
  });

  const firebase = getFirebase();
  if (!firebase) {
    publish({ ready: true, configured: false, email: null, warning: null });
    return;
  }

  onAuthStateChanged(firebase.auth, (user) => {
    const token = ++generation;
    if (!user) {
      setCloudUser(null);
      publish({ ready: true, configured: true, email: null, warning: null });
      return;
    }

    setCloudUser(user.uid);
    publish({
      ready: true,
      configured: true,
      email: user.email,
      warning: null,
    });
    void adoptCloud(user.uid, token);
  });
}

async function adoptCloud(userId: string, token: number) {
  try {
    const remote = await loadCloudConversations(userId);
    if (token !== generation) return;
    const local = getSnapshot();
    const conversations = mergeConversations(local.conversations, remote).slice(
      0,
      MAX_STORED_CONVERSATIONS,
    );
    const activeId = conversations.some((conversation) => conversation.id === local.activeId)
      ? local.activeId
      : null;
    replaceState({ conversations, activeId });
  } catch {
    if (token !== generation) return;
    publish({
      ...accountState,
      warning: "Signed in, but chats could not be loaded from your account.",
    });
  }
}

export async function createAccount(email: string, password: string) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Accounts are not connected yet.");
  await createUserWithEmailAndPassword(firebase.auth, email, password);
}

export async function signInAccount(email: string, password: string) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Accounts are not connected yet.");
  await signInWithEmailAndPassword(firebase.auth, email, password);
}

export async function sendReset(email: string) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Accounts are not connected yet.");
  await sendPasswordResetEmail(firebase.auth, email);
}

export async function signOutAccount() {
  const firebase = getFirebase();
  if (!firebase) return;
  await flushCloudSync();
  await signOut(firebase.auth);
}

export function accountErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Sign in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Use at least 8 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in is turned off in Firebase. Enable Email/Password.";
    default:
      return "The account request could not be completed.";
  }
}

function mergeConversations(local: Conversation[], remote: Conversation[]) {
  const merged = new Map<string, Conversation>();
  for (const conversation of remote) merged.set(conversation.id, conversation);
  for (const conversation of local) {
    const existing = merged.get(conversation.id);
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      merged.set(conversation.id, conversation);
    }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
