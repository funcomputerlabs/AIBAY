export type Role = "user" | "assistant";

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type ChatState = {
  conversations: Conversation[];
  activeId: string | null;
};

export type ApiMessage = {
  role: Role;
  content: string;
};
