"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useAccount } from "@/components/Account";
import { allConversationsMarkdown, downloadText } from "@/lib/export";
import { useI18n } from "@/lib/i18n";
import { clearMemory, setMemoryEnabled, useMemory } from "@/lib/memory";
import type { Conversation } from "@/lib/types";

type SettingsProps = {
  conversations: Conversation[];
  onClose: () => void;
  onClear: () => void;
};

export function Settings({ conversations, onClose, onClear }: SettingsProps) {
  const [armed, setArmed] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const account = useAccount();
  const memory = useMemory();
  const signedIn = Boolean(account.email);
  const memoryOn = signedIn && memory.enabled;
  const facts = memoryOn ? memory.text.split("\n").filter(Boolean) : [];
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/chat")
      .then((response) => response.json())
      .then((data: { model?: unknown; configured?: unknown }) => {
        if (cancelled) return;
        setModel(typeof data.model === "string" ? data.model : null);
        setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog title={t("settings")} onClose={onClose}>
      <div className="space-y-5 text-sm leading-6 text-zinc-400">
        <p>{account.email ? t("settingsAccount") : t("settingsGuest")}</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-zinc-200">{t("memory")}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {signedIn ? t("memoryHint") : t("memoryGuest")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={memoryOn}
              aria-label={t("memory")}
              disabled={!signedIn}
              onClick={() => setMemoryEnabled(!memory.enabled)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                memoryOn ? "bg-white" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform ${
                  memoryOn ? "translate-x-5 bg-zinc-950" : "bg-zinc-300"
                }`}
              />
            </button>
          </div>
          {memoryOn ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              {facts.length ? (
                <ul className="max-h-36 space-y-1 overflow-y-auto text-xs leading-5 text-zinc-300">
                  {facts.map((fact, index) => (
                    <li key={`${index}-${fact}`}>{fact}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-5 text-zinc-500">{t("memoryEmpty")}</p>
              )}
              {facts.length ? (
                <button
                  type="button"
                  onClick={() => clearMemory()}
                  className="mt-3 text-xs text-zinc-400 transition hover:text-zinc-200"
                >
                  {t("memoryClear")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <p>{t("settingsGroq")}</p>
        <p>{t("settingsImprove")}</p>
        <dl className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500">{t("model")}</dt>
            <dd className="truncate font-mono text-xs text-zinc-200">{model ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500">{t("server")}</dt>
            <dd className="text-zinc-200">
              {configured === null ? "—" : configured ? t("connected") : t("keyMissing")}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-zinc-500">{t("shortcut")}</p>
        {conversations.length ? (
          <button
            type="button"
            onClick={() => downloadText("aibay-chats.md", allConversationsMarkdown(conversations))}
            className="h-10 w-full rounded-full border border-white/10 text-sm text-zinc-200 transition hover:bg-white/[0.05]"
          >
            {t("exportAll")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            onClear();
            onClose();
          }}
          className="h-10 w-full rounded-full border border-red-400/30 text-sm text-red-200 transition hover:bg-red-500/10"
        >
          {armed ? t("confirmClear") : t("clear")}
        </button>
      </div>
    </Dialog>
  );
}
