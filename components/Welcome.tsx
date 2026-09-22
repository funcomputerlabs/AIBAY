"use client";

import { SUGGESTIONS } from "@/lib/constants";
import { Logo } from "@/components/Logo";

export function Welcome({ onSuggest }: { onSuggest: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <Logo priority className="w-[min(420px,86vw)]" />
      <h1 className="mt-1 text-3xl font-medium tracking-tight text-white sm:text-4xl">
        Welcome to AIBAY
      </h1>
      <p className="mt-3 text-[#9aa3b5]">Your AI, your way.</p>
      <div className="mt-10 grid w-full gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSuggest(prompt)}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition duration-200 hover:border-white/20 hover:bg-white/[0.05]"
          >
            <span className="text-[11px] tracking-[0.16em] text-zinc-500 uppercase">Try</span>
            <span className="mt-2 block text-sm leading-5 text-zinc-100">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
