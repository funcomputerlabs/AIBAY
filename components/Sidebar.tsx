"use client";

import Link from "next/link";
import { AccountButton } from "@/components/Account";
import { Logo } from "@/components/Logo";
import type { Conversation } from "@/lib/types";
import { cn, formatWhen } from "@/lib/utils";

type SidebarProps = {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onAbout: () => void;
  onAccount: () => void;
};

export function Sidebar({
  conversations,
  activeId,
  open,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onSettings,
  onAbout,
  onAccount,
}: SidebarProps) {
  const recent = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          "z-40 flex h-dvh w-[min(100vw,18.5rem)] shrink-0 flex-col border-r border-white/[0.08] bg-black",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:transition-transform max-md:duration-200",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="px-4 pt-4">
          <Link href="/" aria-label="AIBAY" className="block w-fit" onClick={onClose}>
            <Logo className="w-36" />
          </Link>
        </div>

        <button
          type="button"
          onClick={onNew}
          className="mx-3 mt-1 flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-100 transition hover:bg-white/[0.04]"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New chat
        </button>

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <p className="px-4 text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
            Recent chats
          </p>
          <div className="aibay-scroll mt-2 flex-1 overflow-y-auto px-2 pb-3">
            {recent.length === 0 ? (
              <p className="px-2 py-3 text-sm text-zinc-600">No conversations yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {recent.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <li key={conversation.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelect(conversation.id)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm",
                          active
                            ? "bg-white/[0.06] text-white"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "h-4 w-px shrink-0",
                            active ? "bg-[#49ebff]" : "bg-transparent",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{conversation.title}</span>
                          <span className="block text-[11px] text-zinc-600">
                            {formatWhen(conversation.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${conversation.title}`}
                        onClick={() => onDelete(conversation.id)}
                        className="mr-1 rounded-md p-1.5 text-zinc-600 opacity-100 transition hover:bg-white/[0.06] hover:text-zinc-200 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <path
                            d="M3 3.5h8M5.5 3.5V2.75h3V3.5M4.25 3.5l.4 7.25h4.7l.4-7.25"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-2">
          <AccountButton onOpen={onAccount} />
          <button
            type="button"
            onClick={onSettings}
            className="flex h-10 w-full items-center rounded-lg px-3 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={onAbout}
            className="flex h-10 w-full items-center rounded-lg px-3 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            About AIBAY
          </button>
        </div>
      </aside>
    </>
  );
}
