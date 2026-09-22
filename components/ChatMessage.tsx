"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useI18n } from "@/lib/i18n";
import type { Message } from "@/lib/types";

type ChatMessageProps = {
  message: Message;
  streaming?: boolean;
  onRegenerate?: () => void;
};

export function ChatMessage({ message, streaming = false, onRegenerate }: ChatMessageProps) {
  const { t } = useI18n();
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(40rem,88%)] rounded-2xl bg-white/[0.06] px-4 py-3 text-[15px] leading-7 text-white">
          {message.attachments?.length ? (
            <ul className={`flex flex-wrap gap-2 ${message.content ? "mb-2" : ""}`}>
              {message.attachments.map((attachment) => (
                <li key={attachment.id} className="max-w-full">
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    // User photos are data URLs, which next/image does not optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className="max-h-56 max-w-full rounded-xl object-contain"
                    />
                  ) : (
                    <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-200">
                      <span className="tracking-wide text-zinc-500 uppercase">{t("file")}</span>
                      <span className="truncate">{attachment.name}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {message.content ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : null}
        </div>
      </div>
    );
  }

  const waiting = streaming && message.content.length === 0 && !message.attachments?.length;
  const image = message.attachments?.find((attachment) => attachment.kind === "image" && attachment.dataUrl);

  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <Logo className="mt-1 w-14 shrink-0 sm:w-16" />
      <div className="min-w-0 flex-1 pt-2">
        {waiting ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400" role="status">
            <span className="inline-flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#49ebff]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#49ebff] [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#49ebff] [animation-delay:300ms]" />
            </span>
            {t("generating")}
          </div>
        ) : (
          <div>
            {image?.dataUrl ? (
              // Generated and attached photos are data URLs, which next/image does not optimize.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.dataUrl}
                alt={message.content || t("image")}
                className="max-h-[28rem] max-w-full rounded-2xl object-contain"
              />
            ) : null}
            {message.content ? <MarkdownRenderer content={message.content} /> : null}
            {streaming ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#49ebff]"
              />
            ) : (
              <MessageActions content={message.content} imageUrl={image?.dataUrl} onRegenerate={onRegenerate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageActions({
  content,
  imageUrl,
  onRegenerate,
}: {
  content: string;
  imageUrl?: string;
  onRegenerate?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {content ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(content).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="h-8 rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      ) : null}
      {imageUrl ? (
        <a
          href={imageUrl}
          download="aibay.jpg"
          className="flex h-8 items-center rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          {t("download")}
        </a>
      ) : null}
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          className="h-8 rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          {t("regenerate")}
        </button>
      ) : null}
    </div>
  );
}
