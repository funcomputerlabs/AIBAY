"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useAccount } from "@/components/Account";
import { allConversationsMarkdown, downloadText } from "@/lib/export";
import { useI18n } from "@/lib/i18n";
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
