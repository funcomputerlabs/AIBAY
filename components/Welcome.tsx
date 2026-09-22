"use client";

import { Logo } from "@/components/Logo";
import { chatSuggestions, imageSuggestions, useI18n } from "@/lib/i18n";

export function Welcome({
  mode,
  onSuggest,
}: {
  mode: "chat" | "image";
  onSuggest: (prompt: string) => void;
}) {
  const { locale, t } = useI18n();
  const suggestions = mode === "image" ? imageSuggestions[locale] : chatSuggestions[locale];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <Logo priority className="w-[min(420px,86vw)]" />
      <h1 className="mt-1 text-3xl font-medium tracking-tight text-white sm:text-4xl">{t("welcomeTitle")}</h1>
      <p className="mt-3 text-[#9aa3b5]">{t("welcomeSubtitle")}</p>
      <div className="mt-10 grid w-full gap-3 sm:grid-cols-3">
        {suggestions.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSuggest(prompt)}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition duration-200 hover:border-white/20 hover:bg-white/[0.05]"
          >
            <span className="text-[11px] tracking-[0.16em] text-zinc-500 uppercase">{t("try")}</span>
            <span className="mt-2 block text-sm leading-5 text-zinc-100">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
