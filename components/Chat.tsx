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
import { MAX_MESSAGES } from "@/lib/constants";
import { startAccountSync } from "@/lib/account";
import {
  activateConversation,
  beginRetry,
  clearConversations,
  dropAssistant,
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
  const [draft, setDraft] = useState("");
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
    if (!stickRef.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [active?.messages, status]);

  function stop() {
    abortRef.current?.abort();
  }

  async function streamReply(conversationId: string, history: { role: "user" | "assistant"; content: string }[], assistantId: string) {
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
          messages: history.slice(-MAX_MESSAGES).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          data && typeof data.error === "string"
            ? data.error.slice(0, 240)
            : "AIBAY could not respond.";
        throw new Error(message);
      }

      if (!response.body) throw new Error("AIBAY could not respond.");

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
          setError("AIBAY returned an empty response.");
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
          : "Network error. Check your connection and try again.";
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || status === "streaming") return;
    stickRef.current = true;
    setDraft("");
    setSidebarOpen(false);
    const exchange = startExchange(content);
    void streamReply(exchange.conversationId, exchange.history, exchange.assistantId);
  }

  function retry() {
    if (!active || status === "streaming") return;
    const exchange = beginRetry(active.id);
    if (!exchange) return;
    stickRef.current = true;
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
            aria-label="Open menu"
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
            <Welcome onSuggest={send} />
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
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {error ? (
            <div className="mx-auto flex w-[min(100%-1.5rem,48rem)] items-start justify-between gap-3 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p>{error}</p>
              <button
                type="button"
                onClick={retry}
                className="shrink-0 text-xs font-medium text-white underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          ) : null}
          <ChatInput
            value={draft}
            onChange={setDraft}
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
