import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

/**
 * The SDS badge (circular logo) followed by the text wordmark.
 */
export function Wordmark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "ink";
}) {
  return (
    <Link
      href="/"
      aria-label={siteConfig.name}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4",
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt=""
        width={64}
        height={64}
        priority
        className="size-8 rounded-full ring-1 ring-border-strong transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-105"
      />
      <span
        className={cn(
          "text-[1.0625rem] font-semibold leading-none tracking-[-0.045em]",
          tone === "ink" ? "text-ink-foreground" : "text-foreground",
        )}
      >
        SDS
      </span>
    </Link>
  );
}
