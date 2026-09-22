"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENTS, MAX_MESSAGE_CHARS } from "@/lib/constants";
import type { Attachment } from "@/lib/types";

type ChatInputProps = {
  value: string;
  attachments: Attachment[];
  attachmentError: string | null;
  onChange: (value: string) => void;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
};

export function ChatInput({
  value,
  attachments,
  attachmentError,
  onChange,
  onAttach,
  onRemoveAttachment,
  onSend,
  onStop,
  streaming,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canSend = Boolean(value.trim() || attachments.length > 0);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  function takeFiles(list: FileList | File[] | null) {
    if (!list || streaming) return;
    const files = [...list];
    if (!files.length) return;
    onAttach(files);
  }

  return (
    <div className="shrink-0 px-3 pt-2 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:px-6">
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!streaming && canSend) onSend();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!streaming) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          takeFiles(event.dataTransfer.files);
        }}
      >
        <div
          className={`rounded-2xl border bg-[#0c0e16] transition focus-within:border-[#49ebff]/45 ${
            dragging ? "border-[#49ebff]/70" : "border-white/10"
          }`}
        >
          {attachments.length ? (
            <ul className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <AttachmentChip attachment={attachment} onRemove={() => onRemoveAttachment(attachment.id)} />
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="aibay-message" className="sr-only">
            Message AIBAY
          </label>
          <textarea
            id="aibay-message"
            ref={textareaRef}
            rows={1}
            value={value}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder="Message AIBAY"
            autoComplete="off"
            className="max-h-52 min-h-14 w-full resize-none bg-transparent px-4 pt-4 pb-1 text-[15px] leading-6 text-white outline-none placeholder:text-zinc-600"
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const files = [...event.clipboardData.files];
              if (!files.length) return;
              event.preventDefault();
              takeFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!streaming && canSend) onSend();
            }}
          />
          <div className="flex items-center gap-2 px-3 pt-1 pb-3">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log"
              className="sr-only"
              aria-label="Attach files"
              onChange={(event) => {
                takeFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              aria-label="Attach files"
              disabled={streaming || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path
                  d="M7.2 10.6 11.4 6.4a2.1 2.1 0 0 1 3 3l-5.3 5.3a3.4 3.4 0 0 1-4.8-4.8l5.2-5.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-600">
              {attachmentError ??
                (streaming ? "Generating" : "Attach images or text files · Enter to send")}
            </p>
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="h-9 shrink-0 rounded-full bg-white px-4 text-xs font-medium text-black transition hover:bg-[#e7fbff]"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-[#e7fbff] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-600"
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M8 12.5V3.5M8 3.5L4 7.5M8 3.5l4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1 pr-1 pl-1">
      {attachment.kind === "image" && attachment.dataUrl ? (
        // User photos are data URLs, which next/image does not optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.dataUrl}
          alt=""
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] tracking-wide text-zinc-400 uppercase">
          File
        </span>
      )}
      <span className="max-w-40 truncate text-xs text-zinc-200">{attachment.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-white/[0.06] hover:text-white"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
