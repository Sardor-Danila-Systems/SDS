import type { ReactNode } from "react";
import Signal404 from "@/components/ui/signal-404";

const PALETTE = ["#0b0b0c", "#116bff", "#f7f7f5"] as const;
const FACE =
  'var(--font-onest), "Arial Black", "Helvetica Neue", system-ui, sans-serif';

/**
 * The 404 scene, shared by the localized page and the document-level fallback:
 * the drifting glyph field in the site's colours, a message, and one way out.
 *
 * `framed` sets it in a rounded frame under the site header; unframed it fills
 * the whole screen (the fallback has no header).
 */
export function NotFoundView({
  title,
  subtitle,
  action,
  framed = false,
}: {
  title: string;
  subtitle: string;
  /** The link home — passed in because each caller needs a different kind. */
  action: ReactNode;
  framed?: boolean;
}) {
  const scene = (
    <Signal404
      palette={PALETTE}
      fontFamily={FACE}
      label={`404 — ${title}`}
      height={framed ? "calc(100dvh - 8rem)" : "100dvh"}
      radius={framed ? 28 : 0}
    >
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="pointer-events-auto max-w-md rounded-2xl bg-ink/90 p-5 text-ink-foreground backdrop-blur-md">
          <h2 className="text-xl font-medium tracking-[-0.02em]">{title}</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-foreground/70">{subtitle}</p>
        </div>
        <div className="pointer-events-auto">{action}</div>
      </div>
    </Signal404>
  );

  return framed ? (
    <section className="px-3 pb-4 pt-24 sm:px-4 sm:pt-28">{scene}</section>
  ) : (
    scene
  );
}

/** The call to action both versions use, so the two look the same. */
export const NOT_FOUND_LINK_CLASS =
  "group inline-flex h-12 items-center gap-2.5 rounded-md bg-primary px-6 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
