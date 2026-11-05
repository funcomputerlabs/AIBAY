"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { About } from "@/components/About";
import { Call } from "@/components/Call";
import { AccountDialog, useAccount } from "@/components/Account";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { Logo } from "@/components/Logo";
import { Gallery } from "@/components/Gallery";
import { Settings } from "@/components/Settings";
import { Sidebar } from "@/components/Sidebar";
import { Welcome } from "@/components/Welcome";
import { MAX_ATTACHMENTS, MAX_MESSAGES } from "@/lib/constants";
import { compressDataUrl, readAttachment } from "@/lib/files";
import { seedGallery } from "@/lib/gallery";
import { useI18n } from "@/lib/i18n";
import { conversationMarkdown, downloadText } from "@/lib/export";
import { toApiMessages } from "@/lib/messages";
import { getSignedInIdToken, startAccountSync } from "@/lib/account";
import { appendImprove, getImproveText } from "@/lib/improve";
import { getMemoryText, isMemoryEnabled, noteExchange } from "@/lib/memory";
import { isOwnerEmail } from "@/lib/owner";
import type { Attachment, ComposerMode } from "@/lib/types";
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
  renameConversation,
  startExchange,
  subscribe,
} from "@/lib/storage";

const DRAFT_KEY = "aibay.draft.v1";

function draftsMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveDraft(id: string, value: string) {
  try {
    const map = draftsMap();
    if (value) map[id] = value;
    else delete map[id];
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function Chat() {
  const { conversations, activeId } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { locale, t, text } = useI18n();
  const account = useAccount();
  const canImprove = isOwnerEmail(account.email);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ComposerMode>("chat");
  const composerMode: ComposerMode = canImprove || mode !== "improve" ? mode : "chat";
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [away, setAway] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const skipDraftWrite = useRef(false);
  const newChatRef = useRef<() => void>(() => undefined);

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const streaming = status === "streaming";

  useEffect(() => {
    startAccountSync();
  }, []);

  useEffect(() => {
    void seedGallery(conversations);
  }, [conversations]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      skipDraftWrite.current = true;
      const stored = draftsMap()[getSnapshot().activeId ?? "_new"];
      setDraft(typeof stored === "string" ? stored : "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return;
    }
    saveDraft(activeId ?? "_new", draft);
  }, [draft, activeId]);

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
    options?: { voice?: boolean },
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
      const last = history[history.length - 1];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = await getSignedInIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const improving = Boolean(token && canImprove && last?.purpose === "improve");
      const memoryOn = !improving && Boolean(token) && isMemoryEnabled();
      const memory = memoryOn ? getMemoryText() : "";
      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          locale,
          messages: toApiMessages(history.slice(-MAX_MESSAGES)),
          ...(token && canImprove && getImproveText() ? { improve: getImproveText() } : {}),
          ...(improving ? { task: "improve" } : {}),
          ...(options?.voice ? { task: "voice" } : {}),
          ...(memory ? { memory } : {}),
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
        return "";
      }

      if (!superseded()) setStatus("idle");
      if (memoryOn && !superseded()) {
        const said = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
        noteExchange(said, accumulated, locale);
      }
      return accumulated;
    } catch (caught) {
      if (!accumulated.trim()) dropAssistant(conversationId, assistantId);
      if (superseded()) return "";

      if (controller.signal.aborted) {
        setStatus("idle");
        return "";
      }

      const message =
        caught instanceof Error && caught.message && caught.message !== "Failed to fetch"
          ? caught.message
          : "network";
      setError(message);
      setStatus("error");
      return "";
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function send(text: string, files: Attachment[] = attachments) {
    const content = text.trim();
    if (status === "streaming") return;
    if (composerMode === "image") {
      void sendImage(content);
      return;
    }
    if (composerMode === "video" || composerMode === "music") {
      void sendMedia(composerMode, content);
      return;
    }
    if (composerMode === "improve") {
      if (!content || !canImprove) return;
      appendImprove(content);
      stickRef.current = true;
      setDraft("");
      setAttachments([]);
      setAttachmentError(null);
      setSidebarOpen(false);
      const improveExchange = startExchange(content, [], "improve");
      void streamReply(improveExchange.conversationId, improveExchange.history, improveExchange.assistantId);
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
      let jobId = "";
      let data: { error?: unknown; dataUrl?: unknown; caption?: unknown; pending?: unknown; jobId?: unknown } | null = null;
      while (requestRef.current === requestId) {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, jobId: jobId || undefined }),
          signal: controller.signal,
        });
        data = (await response.json().catch(() => null)) as {
          error?: unknown;
          dataUrl?: unknown;
          caption?: unknown;
          pending?: unknown;
          jobId?: unknown;
        } | null;
        if (!response.ok) {
          const message = data && typeof data.error === "string" ? data.error : "imageFailed";
          throw new Error(message);
        }
        if (data?.pending) {
          if (typeof data.jobId !== "string" || !data.jobId) throw new Error("imageFailed");
          jobId = data.jobId;
          continue;
        }
        break;
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

  async function sendMedia(kind: "video" | "music", prompt: string, conversationId?: string, assistantId?: string) {
    const requestId = ++requestRef.current;
    setError(null);
    setStatus("streaming");
    const exchange = conversationId && assistantId ? { conversationId, assistantId } : startExchange(prompt, [], kind);
    const controller = new AbortController();
    abortRef.current = controller;
    let jobId = "";

    try {
      while (requestRef.current === requestId) {
        const response = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, prompt, jobId: jobId || undefined }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as { error?: string; url?: string; pending?: boolean; jobId?: string } | null;
        if (!response.ok) throw new Error(data?.error || `${kind}Failed`);
        if (data?.pending) {
          if (!data.jobId) throw new Error(`${kind}Failed`);
          jobId = data.jobId;
          continue;
        }
        if (!data?.url?.startsWith("https://")) throw new Error(`${kind}Failed`);
        if (requestRef.current !== requestId) return;
        finishAssistant(exchange.conversationId, exchange.assistantId, "", {
          id: crypto.randomUUID(),
          name: kind === "video" ? "aibay.mp4" : "aibay.mp3",
          mime: kind === "video" ? "video/mp4" : "audio/mpeg",
          kind: kind === "video" ? "video" : "audio",
          url: data.url,
        });
        setStatus("idle");
        return;
      }
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      dropAssistant(exchange.conversationId, exchange.assistantId);
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      const message = caught instanceof Error && caught.message ? caught.message : `${kind}Failed`;
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
    if (last?.purpose === "video" || last?.purpose === "music") {
      void sendMedia(last.purpose, last.content, active.id, exchange.assistantId);
      return;
    }
    void streamReply(active.id, exchange.history, exchange.assistantId);
  }

  function loadDraft(id: string | null) {
    skipDraftWrite.current = true;
    const stored = draftsMap()[id ?? "_new"];
    setDraft(typeof stored === "string" ? stored : "");
  }

  function selectConversation(id: string) {
    stop();
    activateConversation(id);
    loadDraft(id);
    setError(null);
    setSidebarOpen(false);
    setGalleryOpen(false);
    stickRef.current = true;
  }

  function newChat() {
    stop();
    activateConversation(null);
    loadDraft(null);
    setError(null);
    setAttachments([]);
    setAttachmentError(null);
    setSidebarOpen(false);
    setGalleryOpen(false);
    setStatus("idle");
  }
  newChatRef.current = newChat;

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setSettingsOpen(false);
        setAboutOpen(false);
        setAccountOpen(false);
        return;
      }
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.tagName === "SELECT" ||
          event.target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        window.setTimeout(() => document.getElementById("aibay-search")?.focus(), 0);
        return;
      }
      if (typing) return;
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newChatRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        onRename={renameConversation}
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
        galleryOpen={galleryOpen}
        onGallery={() => {
          setSidebarOpen(false);
          setGalleryOpen((open) => !open);
        }}
        onCall={() => {
          setSidebarOpen(false);
          setGalleryOpen(false);
          setCallOpen(true);
        }}
      />

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 md:h-12 md:px-4">
          <button
            type="button"
            aria-label={t("openMenu")}
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.05] md:hidden"
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
          <Logo className="w-20 md:hidden" />
          <p className="min-w-0 flex-1 truncate text-sm text-zinc-300">
            {galleryOpen ? t("gallery") : active?.title || t("newChat")}
          </p>
          <button
            type="button"
            onClick={() => {
              setGalleryOpen(false);
              setCallOpen(true);
            }}
            className="h-9 rounded-full px-3 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
          >
            {t("call")}
          </button>
          {active && !galleryOpen ? (
            <button
              type="button"
              onClick={() =>
                downloadText(
                  `${active.title.replace(/[<>:"/\\|?*]+/g, "").slice(0, 40) || "aibay"}.md`,
                  conversationMarkdown(active),
                )
              }
              className="hidden h-9 rounded-full px-3 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-white sm:block"
            >
              {t("exportChat")}
            </button>
          ) : null}
        </header>

        {online ? null : (
          <p className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
            {t("offline")}
          </p>
        )}

        <div
          ref={scrollerRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            stickRef.current = nearBottom;
            setAway(!nearBottom && element.scrollHeight > element.clientHeight + 120);
          }}
          className="aibay-scroll min-h-0 flex-1 overflow-y-auto"
        >
          {galleryOpen ? (
            <Gallery />
          ) : showWelcome ? (
            <Welcome mode={composerMode} onSuggest={send} />
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

        {away && !galleryOpen && !showWelcome ? (
          <button
            type="button"
            onClick={() => {
              const scroller = scrollerRef.current;
              if (!scroller) return;
              stickRef.current = true;
              scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
              setAway(false);
            }}
            className="absolute right-4 bottom-28 z-10 h-10 rounded-full border border-white/10 bg-black/90 px-4 text-xs text-zinc-200 shadow-lg backdrop-blur"
          >
            {t("jumpLatest")}
          </button>
        ) : null}

        {galleryOpen ? null : (
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
            mode={composerMode}
            canImprove={canImprove}
            attachments={attachments}
            attachmentError={attachmentError}
            onChange={setDraft}
            onMode={(next) => {
              setMode(next);
              if (next !== "chat") {
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
        )}
      </section>

      {callOpen ? (
        <Call
          locale={locale}
          onClose={() => {
            stop();
            setCallOpen(false);
          }}
          onUtterance={async (text) => {
            stickRef.current = true;
            const exchange = startExchange(text);
            return streamReply(exchange.conversationId, exchange.history, exchange.assistantId, { voice: true });
          }}
        />
      ) : null}
      {settingsOpen ? (
        <Settings conversations={conversations} onClose={() => setSettingsOpen(false)} onClear={clearAll} />
      ) : null}
      {aboutOpen ? <About onClose={() => setAboutOpen(false)} /> : null}
      {accountOpen ? <AccountDialog onClose={() => setAccountOpen(false)} /> : null}
    </div>
  );
}
