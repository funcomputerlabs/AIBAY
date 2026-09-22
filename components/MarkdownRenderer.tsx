"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "@/lib/i18n";

function textFrom(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join("");
  return "";
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/45">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
          {language ?? "text"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-xs text-zinc-400 transition hover:text-white"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  a({ href, children }) {
    const safe = href && /^(https?:|mailto:)/i.test(href) ? href : undefined;
    return (
      <a href={safe} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const code = textFrom(children).replace(/\n$/, "");
    const language = /language-([\w+-]+)/.exec(className ?? "")?.[1];
    const block = Boolean(language) || code.includes("\n");
    if (!block) {
      return (
        <code className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.88em] text-white">
          {children}
        </code>
      );
    }
    return <CodeBlock code={code} language={language} />;
  },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="aibay-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
