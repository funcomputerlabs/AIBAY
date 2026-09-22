import type { Metadata } from "next";
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
  description: "A new generation AI platform.",
  applicationName: "AIBAY",
  openGraph: {
    type: "website",
    title: "AIBAY — AI for everyone",
    description: "A new generation AI platform.",
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
    description: "A new generation AI platform.",
    images: ["/aibay-logo.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh bg-black font-sans text-[#f4f6fb]">{children}</body>
    </html>
  );
}
