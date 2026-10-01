export type Role = "user" | "assistant";

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  kind: "image" | "file" | "video" | "audio";
  dataUrl?: string;
  text?: string;
  url?: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  purpose?: "image" | "video" | "music";
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

export type ApiTextPart = {
  type: "text";
  text: string;
};

export type ApiImagePart = {
  type: "image_url";
  image_url: { url: string };
};

export type ApiContentPart = ApiTextPart | ApiImagePart;

export type ApiMessage = {
  role: Role;
  content: string | ApiContentPart[];
};
