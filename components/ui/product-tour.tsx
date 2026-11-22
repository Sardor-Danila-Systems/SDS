"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";

/*
  Product tour: a spotlight on one element at a time with a short card beside it.

  Adapted from the supplied component for this admin: it uses the admin's own
  colour tokens (so light and dark follow the theme toggle), Russian labels, and
  a step whose target is missing or hidden (the mobile menu is closed) falls
  back to a centred card instead of pointing at nothing.
*/

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto" | "center";

export type TourStep = {
  /** CSS selector of the element to highlight. Without one, the card is centred. */
  target?: string;
  title: string;
  content: React.ReactNode;
  placement?: TourPlacement;
  padding?: number;
};

export type TourProps = {
  steps: TourStep[];
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  index?: number;
  onIndexChange?: (index: number) => void;
  onFinish?: () => void;
  onSkip?: () => void;
  showProgress?: boolean;
  clickToNext?: boolean;
  className?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const SPRING = { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.7 };

/** The element, only if it is actually on screen. */
function findVisible(selector?: string): HTMLElement | null {
  if (!selector) return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

export function Tour({
  steps,
  open,
  onOpenChange,
  index: controlledIndex,
  onIndexChange,
  onFinish,
  onSkip,
  showProgress = true,
  clickToNext = false,
  className,
}: TourProps) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const [indexState, setIndexState] = React.useState(0);
  const index = controlledIndex ?? indexState;
  const setIndex = React.useCallback(
    (i: number) => {
      onIndexChange?.(i);
      setIndexState(i);
    },
    [onIndexChange],
  );

  const cardRef = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [cardSize, setCardSize] = React.useState({ w: 320, h: 168 });
  const [vp, setVp] = React.useState({ w: 1024, h: 768 });

  React.useEffect(() => setMounted(true), []);

  const step = steps[index];
  const count = steps.length;
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const pad = step?.padding ?? 8;

  const finish = React.useCallback(() => {
    onFinish?.();
    onOpenChange?.(false);
    setIndexState(0);
  }, [onFinish, onOpenChange]);

  const skip = React.useCallback(() => {
    onSkip?.();
    onOpenChange?.(false);
    setIndexState(0);
  }, [onSkip, onOpenChange]);

  const next = React.useCallback(() => {
    if (isLast) finish();
    else setIndex(index + 1);
  }, [isLast, finish, index, setIndex]);

  const back = React.useCallback(() => {
    if (!isFirst) setIndex(index - 1);
  }, [isFirst, index, setIndex]);

  React.useEffect(() => {
    if (!open) return;
    const measure = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      const el = findVisible(step?.target);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    findVisible(step?.target)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center", inline: "center" });

    measure();
    const settle = window.setTimeout(measure, reduce ? 0 : 320);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, index, step, reduce]);

  React.useLayoutEffect(() => {
    if (cardRef.current) {
      const r = cardRef.current.getBoundingClientRect();
      setCardSize({ w: r.width, h: r.height });
    }
  }, [index, open, rect]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Tab") {
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])");
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, skip]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>("[data-tour-primary]")?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, index]);

  if (!mounted || !open || !step) return null;

  const gap = 14;
  let place: TourPlacement = step.placement ?? "auto";
  if (!rect) place = "center";
  if (place === "auto" && rect) {
    if (rect.top + rect.height + gap + cardSize.h < vp.h) place = "bottom";
    else if (rect.top - gap - cardSize.h > 0) place = "top";
    else if (rect.left + rect.width + gap + cardSize.w < vp.w) place = "right";
    else place = "left";
  }

  let left = vp.w / 2 - cardSize.w / 2;
  let top = vp.h / 2 - cardSize.h / 2;
  if (rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (place === "bottom") {
      left = cx - cardSize.w / 2;
      top = rect.top + rect.height + gap + pad;
    } else if (place === "top") {
      left = cx - cardSize.w / 2;
      top = rect.top - gap - pad - cardSize.h;
    } else if (place === "right") {
      left = rect.left + rect.width + gap + pad;
      top = cy - cardSize.h / 2;
    } else if (place === "left") {
      left = rect.left - gap - pad - cardSize.w;
      top = cy - cardSize.h / 2;
    }
  }
  left = Math.min(Math.max(12, left), vp.w - 12 - cardSize.w);
  top = Math.min(Math.max(12, top), vp.h - 12 - cardSize.h);

  const spot = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  const overlayInk = "rgba(8,10,16,0.55)";

  return createPortal(
    <div className={className}>
      <AnimatePresence>
        <motion.div
          key="tour-layer"
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={typeof step.title === "string" ? step.title : "Обзор новинок"}
        >
          <div className="absolute inset-0" onClick={() => clickToNext && next()} />

          {spot ? (
            <motion.div
              className="pointer-events-none absolute rounded-xl"
              initial={false}
              animate={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
              transition={reduce ? { duration: 0 } : SPRING}
              style={{ boxShadow: `0 0 0 9999px ${overlayInk}`, outline: "1px solid rgba(255,255,255,0.7)", outlineOffset: 2 }}
            />
          ) : (
            <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: overlayInk }} />
          )}

          <motion.div
            ref={cardRef}
            className="absolute w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl shadow-black/25"
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, left, top }}
            transition={reduce ? { duration: 0 } : SPRING}
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em]">{step.title}</h3>
              <button
                type="button"
                onClick={skip}
                aria-label="Закрыть обзор"
                className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <IconX />
              </button>
            </div>

            <div className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{step.content}</div>

            <div className="mt-4 flex items-center justify-between">
              {showProgress ? (
                <div className="flex items-center gap-1.5" aria-hidden>
                  {steps.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-primary" : "w-1.5 bg-border-strong"}`} />
                  ))}
                </div>
              ) : (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {index + 1} / {count}
                </span>
              )}

              <div className="flex items-center gap-1.5">
                {!isFirst && (
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <IconArrow className="rotate-180" />
                    Назад
                  </button>
                )}
                <button
                  type="button"
                  data-tour-primary
                  onClick={next}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[0.8125rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  {isLast ? "Понятно" : "Далее"}
                  {!isLast && <IconArrow />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export function useTour(storageKey?: string) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);

  const seen = React.useCallback(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);

  const start = React.useCallback(() => {
    setIndex(0);
    setOpen(true);
  }, []);

  const markSeen = React.useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      return;
    }
  }, [storageKey]);

  return { open, setOpen, index, setIndex, start, seen, markSeen };
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="h-4 w-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
