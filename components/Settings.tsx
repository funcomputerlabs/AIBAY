"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useAccount } from "@/components/Account";

type SettingsProps = {
  onClose: () => void;
  onClear: () => void;
};

export function Settings({ onClose, onClear }: SettingsProps) {
  const [armed, setArmed] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const account = useAccount();

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
    <Dialog title="Settings" onClose={onClose}>
      <div className="space-y-5 text-sm leading-6 text-zinc-400">
        <p>
          {account.email
            ? "This account keeps your chats with you. Groq still runs only on the server."
            : "Without an account, conversations stay on this device. Creating an account is optional."}
        </p>
        <p>
          AIBAY calls GroqCloud from the server. The API key never reaches the browser.
        </p>
        <dl className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500">Model</dt>
            <dd className="truncate font-mono text-xs text-zinc-200">{model ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500">Server</dt>
            <dd className="text-zinc-200">
              {configured === null ? "—" : configured ? "Connected" : "Key missing"}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-zinc-500">Enter sends. Shift + Enter adds a new line.</p>
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
          {armed ? "Confirm clear" : "Clear all conversations"}
        </button>
      </div>
    </Dialog>
  );
}
