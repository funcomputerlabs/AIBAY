"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { removeGalleryItem, useGallery, type GalleryKind } from "@/lib/gallery";
import { formatWhen } from "@/lib/utils";

type Filter = "all" | GalleryKind;

export function Gallery() {
  const { locale, t } = useI18n();
  const { ready, items } = useGallery();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? items : items.filter((item) => item.kind === filter);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-lg font-medium text-white">{t("gallery")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("galleryLead")}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          {t("galleryAll")}
        </FilterButton>
        <FilterButton active={filter === "image"} onClick={() => setFilter("image")}>
          {t("galleryImages")}
        </FilterButton>
        <FilterButton active={filter === "video"} onClick={() => setFilter("video")}>
          {t("galleryVideos")}
        </FilterButton>
        <FilterButton active={filter === "audio"} onClick={() => setFilter("audio")}>
          {t("gallerySongs")}
        </FilterButton>
      </div>
      {!ready ? null : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-600">{t("galleryEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e16]">
              {item.kind === "image" && item.dataUrl ? (
                // Saved photos are data URLs, which next/image does not optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.dataUrl} alt={item.prompt || t("image")} className="aspect-square w-full object-cover" />
              ) : null}
              {item.kind === "video" && item.url ? (
                <video src={item.url} controls playsInline className="aspect-video w-full bg-black" />
              ) : null}
              {item.kind === "audio" && item.url ? (
                <div className="flex aspect-video items-center bg-black px-4">
                  <audio src={item.url} controls className="w-full" />
                </div>
              ) : null}
              <div className="space-y-3 p-3">
                <div>
                  <p className="line-clamp-2 text-sm text-zinc-200">{item.prompt || t(item.kind === "audio" ? "music" : item.kind)}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">{formatWhen(item.createdAt, locale)}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={item.dataUrl || item.url}
                    download={item.name}
                    className="flex h-8 items-center rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    {t("download")}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void removeGalleryItem(item.id);
                    }}
                    className="h-8 rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 rounded-full px-3 text-xs transition ${
        active ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
