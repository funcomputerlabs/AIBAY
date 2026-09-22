"use client";

import { useEffect, useRef } from "react";
import { MAX_MESSAGE_CHARS } from "@/lib/constants";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
};

export function ChatInput({ value, onChange, onSend, onStop, streaming }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <div className="shrink-0 px-3 pt-2 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:px-6">
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!streaming) onSend();
        }}
      >
        <div className="rounded-2xl border border-white/10 bg-[#0c0e16] transition focus-within:border-[#49ebff]/45">
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
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!streaming) onSend();
            }}
          />
          <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-3">
            <p className="text-[11px] text-zinc-600">
              {streaming ? "Generating" : "Enter to send · Shift + Enter for a new line"}
            </p>
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="h-9 rounded-full bg-white px-4 text-xs font-medium text-black transition hover:bg-[#e7fbff]"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!value.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-[#e7fbff] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-600"
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
