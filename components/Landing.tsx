import Link from "next/link";
import { Logo } from "@/components/Logo";

export function Landing() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-hidden bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[18%] left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(73,235,255,0.14),rgba(120,80,255,0.05)_42%,transparent_70%)]"
      />

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Logo
          priority
          className="aibay-rise w-[min(640px,88vw)]"
        />
        <h1 className="aibay-rise aibay-rise-2 mt-2 max-w-3xl text-4xl font-medium tracking-tight text-white sm:text-6xl">
          Intelligence, reimagined.
        </h1>
        <p className="aibay-rise aibay-rise-3 mt-5 max-w-xl text-base text-[#9aa3b5] sm:text-lg">
          Una nueva forma de interactuar con inteligencia artificial.
        </p>
        <Link
          href="/chat"
          className="aibay-rise aibay-rise-4 mt-10 inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-sm font-medium tracking-wide text-black transition duration-200 hover:bg-[#e7fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#49ebff]"
        >
          Start chatting
        </Link>
      </section>
    </main>
  );
}
