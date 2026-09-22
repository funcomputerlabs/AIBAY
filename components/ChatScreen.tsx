"use client";

import dynamic from "next/dynamic";
import { Logo } from "@/components/Logo";

const Chat = dynamic(() => import("@/components/Chat").then((mod) => mod.Chat), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-black">
      <Logo className="w-40" />
    </div>
  ),
});

export function ChatScreen() {
  return <Chat />;
}
