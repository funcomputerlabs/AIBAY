import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  priority?: boolean;
};

export function Logo({ className, priority = false }: LogoProps) {
  return (
    <span className={cn("inline-block", className)}>
      <Image
        src="/aibay-logo.png"
        alt="AIBAY"
        width={1547}
        height={1017}
        priority={priority}
        unoptimized
        className="h-auto w-full"
      />
    </span>
  );
}
