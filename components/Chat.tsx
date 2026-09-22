"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { About } from "@/components/About";
import { AccountDialog } from "@/components/Account";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { Logo } from "@/components/Logo";
import { Settings } from "@/components/Settings";
import { Sidebar } from "@/components/Sidebar";
import { Welcome } from "@/components/Welcome";
import { MAX_ATTACHMENTS, MAX_MESSAGES } from "@/lib/constants";
import { compressDataUrl, readAttachment } from "@/lib/files";
import { useI18n } from "@/lib/i18n";
import { toApiMessages } from "@/lib/messages";
import { startAccountSync } from "@/lib/account";
import type { Attachment } from "@/lib/types";
import {
  activateConversation,
  beginRetry,
  clearConversations,
  dropAssistant,
  finishAssistant,
  getServerSnapshot,
  getSnapshot,
  patchAssistant,
  removeConversation,
  startExchange,
  subscribe,
} from "@/lib/storage";

export function Chat() {
  const { conversations, activeId } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { locale, t, text } = useI18n();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const streaming = status === "streaming";

  useEffect(() => {
    startAccountSync();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!stickRef.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [active?.messages, status]);

  function stop() {
    abortRef.current?.abort();
  }

  async function streamReply(
    conversationId: string,
    history: Parameters<typeof toApiMessages>[0],
    assistantId: string,
  ) {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("streaming");
    setError(null);

    let accumulated = "";
    const superseded = () => requestRef.current !== requestId;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: toApiMessages(history.slice(-MAX_MESSAGES)),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          data && typeof data.error === "string"
            ? data.error.slice(0, 240)
            : "couldNotRespond";
        throw new Error(message);
      }

      if (!response.body) throw new Error("couldNotRespond");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        if (!superseded()) patchAssistant(conversationId, assistantId, accumulated);
      }

      accumulated += decoder.decode();
      if (!superseded() && accumulated) {
        patchAssistant(conversationId, assistantId, accumulated);
      }

      if (!accumulated.trim()) {
        dropAssistant(conversationId, assistantId);
        if (!superseded()) {
          setError("emptyResponse");
          setStatus("error");
        }
        return;
      }

      if (!superseded()) setStatus("idle");
    } catch (caught) {
      if (!accumulated.trim()) dropAssistant(conversationId, assistantId);
      if (superseded()) return;

      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }

      const message =
        caught instanceof Error && caught.message && caught.message !== "Failed to fetch"
          ? caught.message
          : "network";
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function send(text: string, files: Attachment[] = attachments) {
    const content = text.trim();
    if (status === "streaming") return;
    if (mode === "image") {
      void sendImage(content);
      return;
    }
    if (!content && files.length === 0) return;
    stickRef.current = true;
    setDraft("");
    setAttachments([]);
    setAttachmentError(null);
    setSidebarOpen(false);
    const exchange = startExchange(content, files);
    void streamReply(exchange.conversationId, exchange.history, exchange.assistantId);
  }

  async function sendImage(prompt: string, conversationId?: string, assistantId?: string) {
    if (!prompt || status === "streaming") return;
    stickRef.current = true;
    setDraft("");
    setAttachments([]);
    setAttachmentError(null);
    setSidebarOpen(false);

    const exchange = conversationId && assistantId
      ? { conversationId, assistantId }
      : startExchange(prompt, [], "image");
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("streaming");
    setError(null);

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as { error?: unknown; dataUrl?: unknown; caption?: unknown } | null;
      if (!response.ok) {
        const message = data && typeof data.error === "string" ? data.error : "imageFailed";
        throw new Error(message);
      }
      if (!data || typeof data.dataUrl !== "string") throw new Error("imageFailed");
      let dataUrl = data.dataUrl;
      try {
        dataUrl = await compressDataUrl(data.dataUrl);
      } catch {
        if (data.dataUrl.length > 1_200_000) throw new Error("imageFailed");
      }
      if (requestRef.current !== requestId) return;
      finishAssistant(
        exchange.conversationId,
        exchange.assistantId,
        typeof data.caption === "string" ? data.caption : "",
        {
          id: crypto.randomUUID(),
          name: "aibay.jpg",
          mime: "image/jpeg",
          kind: "image",
          dataUrl,
        },
      );
      setStatus("idle");
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      dropAssistant(exchange.conversationId, exchange.assistantId);
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      const message = caught instanceof Error && caught.message ? caught.message : "imageFailed";
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function addFiles(list: File[]) {
    if (status === "streaming") return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setAttachmentError("tooManyFiles");
      return;
    }

    const next: Attachment[] = [];
    let error: string | null = null;
    for (const file of list.slice(0, room)) {
      const result = await readAttachment(file);
      if (!result.ok) {
        error = result.error;
        continue;
      }
      next.push(result.attachment);
    }

    if (list.length > room) error = "tooManyFiles";
    setAttachmentError(error);
    if (next.length) setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
  }

  function retry() {
    if (!active || status === "streaming") return;
    const exchange = beginRetry(active.id);
    if (!exchange) return;
    stickRef.current = true;
    const last = exchange.history[exchange.history.length - 1];
    if (last?.purpose === "image") {
      void sendImage(last.content, active.id, exchange.assistantId);
      return;
    }
    void streamReply(active.id, exchange.history, exchange.assistantId);
  }

  function selectConversation(id: string) {
    stop();
    activateConversation(id);
    setError(null);
    setSidebarOpen(false);
    stickRef.current = true;
  }

  function newChat() {
    stop();
    activateConversation(null);
    setError(null);
    setDraft("");
    setAttachments([]);
    setAttachmentError(null);
    setSidebarOpen(false);
    setStatus("idle");
  }

  function deleteConversation(id: string) {
    if (activeId === id) {
      stop();
      setError(null);
      setStatus("idle");
    }
    removeConversation(id);
  }

  function clearAll() {
    stop();
    clearConversations();
    setError(null);
    setDraft("");
    setAttachments([]);
    setAttachmentError(null);
    setStatus("idle");
  }

  const showWelcome = !active || active.messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-black text-[#f4f6fb]">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onSettings={() => {
          setSidebarOpen(false);
          setSettingsOpen(true);
        }}
        onAbout={() => {
          setSidebarOpen(false);
          setAboutOpen(true);
        }}
        onAccount={() => {
          setSidebarOpen(false);
          setAccountOpen(true);
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:hidden">
          <button
            type="button"
            aria-label={t("openMenu")}
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.05]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M3 4.5h12M3 9h12M3 13.5h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Logo className="w-20" />
        </header>

        <div
          ref={scrollerRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            stickRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
          className="aibay-scroll min-h-0 flex-1 overflow-y-auto"
        >
          {showWelcome ? (
            <Welcome mode={mode} onSuggest={send} />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6">
              {active.messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  streaming={
                    streaming &&
                    message.role === "assistant" &&
                    index === active.messages.length - 1
                  }
                  onRegenerate={
                    !streaming && message.role === "assistant" && index === active.messages.length - 1
                      ? retry
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {error ? (
            <div className="mx-auto flex w-[min(100%-1.5rem,48rem)] items-start justify-between gap-3 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p>{text(error)}</p>
              <button
                type="button"
                onClick={retry}
                className="shrink-0 text-xs font-medium text-white underline underline-offset-2"
              >
                {t("tryAgain")}
              </button>
            </div>
          ) : null}
          <ChatInput
            value={draft}
            mode={mode}
            attachments={attachments}
            attachmentError={attachmentError}
            onChange={setDraft}
            onMode={(next) => {
              setMode(next);
              if (next === "image") {
                setAttachments([]);
                setAttachmentError(null);
              }
            }}
            onAttach={(files) => {
              void addFiles(files);
            }}
            onRemoveAttachment={(id) => {
              setAttachments((current) => current.filter((attachment) => attachment.id !== id));
              setAttachmentError(null);
            }}
            onSend={() => send(draft)}
            onStop={stop}
            streaming={streaming}
          />
        </div>
      </section>

      {settingsOpen ? <Settings onClose={() => setSettingsOpen(false)} onClear={clearAll} /> : null}
      {aboutOpen ? <About onClose={() => setAboutOpen(false)} /> : null}
      {accountOpen ? <AccountDialog onClose={() => setAccountOpen(false)} /> : null}
    </div>
  );
}
