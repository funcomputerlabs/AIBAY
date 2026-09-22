"use client";

import { Dialog } from "@/components/Dialog";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";

export function About({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  return (
    <Dialog title={t("about")} onClose={onClose}>
      <div className="space-y-4 text-sm leading-6 text-zinc-400">
        <Logo className="w-40" />
        <p className="text-base text-white">{t("aboutLead")}</p>
        <p>{t("aboutBody")}</p>
        <p>{t("aboutPrivacy")}</p>
      </div>
    </Dialog>
  );
}
