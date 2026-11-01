import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AIBAY — AI for everyone",
    template: "%s — AIBAY",
  },
  description: "AIBAY is an independent AI for chat, images, video, music, and live voice calls.",
  applicationName: "AIBAY",
  keywords: ["AIBAY", "AI", "chat", "image generation", "video", "music", "voice"],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "AIBAY — AI for everyone",
    description: "AIBAY is an independent AI for chat, images, video, music, and live voice calls.",
    siteName: "AIBAY",
    images: [
      {
        url: "/aibay-logo.png",
        alt: "AIBAY",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIBAY — AI for everyone",
    description: "AIBAY is an independent AI for chat, images, video, music, and live voice calls.",
    images: ["/aibay-logo.png"],
  },
  verification: {
    google: "S_HATGXtzjbruRLHY5HTeQit7v-El4hJkaVolmRgHLs",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="google-site-verification" content="S_HATGXtzjbruRLHY5HTeQit7v-El4hJkaVolmRgHLs" />
      </head>
      <body className="min-h-dvh bg-black font-sans text-[#f4f6fb]">{children}</body>
    </html>
  );
}
