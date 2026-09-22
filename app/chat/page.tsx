import type { Metadata } from "next";
import { ChatScreen } from "@/components/ChatScreen";

export const metadata: Metadata = {
  title: "Chat",
  description: "Talk with AIBAY.",
};

export default function ChatPage() {
  return <ChatScreen />;
}
