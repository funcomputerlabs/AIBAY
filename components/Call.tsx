"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

type Phase = "connecting" | "listening" | "thinking" | "speaking";

type CallProps = {
  locale: Locale;
  onClose: () => void;
  onUtterance: (text: string) => Promise<string | undefined>;
};

export function Call({ locale, onClose, onUtterance }: CallProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);

  function stopMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function run() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("callDenied");
      return;
    }

    await speak(t("callHello"), locale);
    while (live.current) {
      setPhase("listening");
      setCaption("");
      const clip = await captureUtterance(streamRef.current);
      if (!live.current) break;
      if (!clip) continue;

      setPhase("thinking");
      const spoken = await transcribe(clip, locale);
      if (!live.current) break;
      if (!spoken) continue;
      setCaption(spoken);

      const reply = await onUtterance(spoken);
      if (!live.current) break;
      if (!reply?.trim()) continue;

      setPhase("speaking");
      setCaption(reply);
      await speak(reply, locale);
    }
  }

  useEffect(() => {
    live.current = true;
    const timer = window.setTimeout(() => {
      void run();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      live.current = false;
      stopMic();
      window.speechSynthesis?.cancel();
    };
    // Start the call once when the overlay opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hangUp() {
    live.current = false;
    stopMic();
    window.speechSynthesis?.cancel();
    onClose();
  }

  const label =
    error === "callDenied"
      ? t("callDenied")
      : phase === "listening"
        ? t("listening")
        : phase === "thinking"
          ? t("thinking")
          : phase === "speaking"
            ? t("speaking")
            : t("callConnecting");

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6">
      <Logo className="w-40" />
      <div className="mt-10 flex items-center gap-2" aria-hidden>
        <span className={`h-2.5 w-2.5 rounded-full bg-[#49ebff] ${phase === "listening" ? "animate-pulse" : ""}`} />
        <span className={`h-2.5 w-2.5 rounded-full bg-[#49ebff] ${phase === "listening" ? "animate-pulse [animation-delay:150ms]" : ""}`} />
        <span className={`h-2.5 w-2.5 rounded-full bg-[#49ebff] ${phase === "listening" ? "animate-pulse [animation-delay:300ms]" : ""}`} />
      </div>
      <p className="mt-5 text-sm text-zinc-300" role="status">
        {label}
      </p>
      {caption ? <p className="mt-4 max-w-md text-center text-sm text-zinc-500">{caption}</p> : null}
      <button
        type="button"
        onClick={hangUp}
        className="mt-10 h-12 rounded-full bg-red-500 px-8 text-sm font-medium text-white transition hover:bg-red-400"
      >
        {t("hangUp")}
      </button>
    </div>
  );
}

async function transcribe(blob: Blob, locale: Locale) {
  const body = new FormData();
  body.set("audio", blob, "aibay.webm");
  body.set("locale", locale);
  const response = await fetch("/api/voice/transcribe", { method: "POST", body });
  const data = (await response.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
  if (!response.ok) return "";
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (text.length < 2) return "";
  if (/^(thanks? for watching\.?|subtitles by|amara\.org)$/i.test(text)) return "";
  return text;
}

async function speak(text: string, locale: Locale) {
  const clean = text.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (locale === "en") {
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (response.ok) {
        const blob = await response.blob();
        await playBlob(blob);
        return;
      }
    } catch {
      /* use the device voice */
    }
  }
  await speakLocal(clean, locale);
}

function speakLocal(text: string, locale: Locale) {
  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang(locale);
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(locale));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function playBlob(blob: Blob) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    void audio.play().catch(() => resolve());
  });
}

function speechLang(locale: Locale) {
  if (locale === "en") return "en-US";
  if (locale === "pt") return "pt-PT";
  return `${locale}-${locale.toUpperCase()}`;
}

async function captureUtterance(stream: MediaStream | null) {
  if (!stream) return null;
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) return null;

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const started = Date.now();
  let heard = false;
  let quietSince = 0;
  recorder.start();

  await new Promise<void>((resolve) => {
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      if (rms > 0.02) {
        heard = true;
        quietSince = Date.now();
      }
      if (stream.getAudioTracks().every((track) => track.readyState === "ended")) {
        resolve();
        return;
      }
      const elapsed = Date.now() - started;
      const silence = heard && Date.now() - quietSince > 1_100;
      if (elapsed > 16_000 || (silence && elapsed > 700)) {
        resolve();
        return;
      }
      if (!heard && elapsed > 8_000) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    if (recorder.state !== "inactive") recorder.stop();
    else resolve();
  });
  await context.close();
  if (!heard || !chunks.length) return null;
  return new Blob(chunks, { type: mime });
}
