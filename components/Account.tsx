"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/Dialog";
import { useI18n } from "@/lib/i18n";
import {
  accountErrorMessage,
  createAccount,
  getAccountSnapshot,
  getServerAccountSnapshot,
  sendReset,
  signInAccount,
  signOutAccount,
  subscribeAccount,
} from "@/lib/account";

export function useAccount() {
  return useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
}

export function AccountButton({ onOpen }: { onOpen: () => void }) {
  const account = useAccount();
  const { t, text } = useI18n();

  if (!account.ready) {
    return (
      <p className="px-3 py-2 text-xs text-zinc-600">{t("accountLabel")}</p>
    );
  }

  if (account.email) {
    return (
      <div className="px-1">
        <p className="truncate px-2 text-xs text-zinc-500">{account.email}</p>
        {account.warning ? <p className="px-2 pt-1 text-xs text-amber-200/80">{text(account.warning)}</p> : null}
        <button
          type="button"
          onClick={() => {
            void signOutAccount();
          }}
          className="flex h-10 w-full items-center rounded-lg px-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
        >
          {t("signOut")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-10 w-full items-center rounded-lg px-3 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
    >
      {t("createAccount")}
    </button>
  );
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const [mode, setMode] = useState<"create" | "sign-in">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t, text } = useI18n();

  async function submit() {
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 8) {
      setError("validEmail");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") await createAccount(email.trim(), password);
      else await signInAccount(email.trim(), password);
      onClose();
    } catch (caught) {
      setError(accountErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("enterEmail");
      return;
    }
    setBusy(true);
    try {
      await sendReset(email.trim());
      setNotice("resetSent");
    } catch (caught) {
      setError(accountErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={mode === "create" ? t("createAccount") : t("signIn")} onClose={onClose}>
      <div className="space-y-4 text-sm leading-6 text-zinc-400">
        <p>{t("accountOptional")}</p>
        {account.configured ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide text-zinc-500 uppercase">{t("email")}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-white outline-none focus:border-[#49ebff]/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide text-zinc-500 uppercase">{t("password")}</span>
              <input
                type="password"
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-white outline-none focus:border-[#49ebff]/50"
              />
            </label>
            {error ? <p className="text-sm text-red-200">{text(error)}</p> : null}
            {notice ? <p className="text-sm text-zinc-200">{text(notice)}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-full bg-white text-sm font-medium text-black transition hover:bg-[#e7fbff] disabled:opacity-60"
            >
              {busy ? t("pleaseWait") : mode === "create" ? t("createAccount") : t("signIn")}
            </button>
            <button
              type="button"
              className="w-full text-center text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
              onClick={() => {
                setMode(mode === "create" ? "sign-in" : "create");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "create" ? t("haveAccount") : t("newAccount")}
            </button>
            {mode === "sign-in" ? (
              <button
                type="button"
                className="w-full text-center text-xs text-zinc-500 hover:text-white"
                onClick={() => {
                  void resetPassword();
                }}
              >
                {t("forgot")}
              </button>
            ) : null}
          </form>
        ) : (
          <p>{t("accountFirebase")}</p>
        )}
      </div>
    </Dialog>
  );
}
