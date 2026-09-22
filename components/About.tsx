"use client";

import { Dialog } from "@/components/Dialog";
import { Logo } from "@/components/Logo";

export function About({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="About AIBAY" onClose={onClose}>
      <div className="space-y-4 text-sm leading-6 text-zinc-400">
        <Logo className="w-40" />
        <p className="text-base text-white">A new generation AI platform.</p>
        <p>
          AIBAY is an independent assistant for thinking, writing, analysis, and building.
          Responses are generated live through GroqCloud.
        </p>
        <p>Your conversations remain in this browser until you delete them.</p>
      </div>
    </Dialog>
  );
}
