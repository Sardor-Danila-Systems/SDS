"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE } from "./reveal";

/**
 * Headline lines that rise out from behind their own baseline.
 *
 * Lines are authored per locale rather than split from a single string, so a
 * translation never breaks in an awkward place. Each line stays one element,
 * so it still wraps normally when the viewport is too narrow for it.
 */
export function AnimatedText({
  lines,
  className,
  delay = 0.08,
  stagger = 0.085,
  /** `mount` for above-the-fold copy, `inView` for anything further down. */
  trigger = "mount",
  as: Tag = "span",
}: {
  lines: string[];
  className?: string;
  delay?: number;
  stagger?: number;
  trigger?: "mount" | "inView";
  as?: "span" | "div";
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  /*
    Observe the container, not the moving line: the line starts translated
    out of its own `overflow-hidden` mask, so an IntersectionObserver on it
    sees it as fully clipped and `whileInView` would never fire.
  */
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const play = trigger === "mount" || inView;

  /*
    Both states must always animate the same properties. `useReducedMotion`
    resolves to false during the server render and can flip to true after
    hydration; if the two objects listed different properties, the target
    would no longer clear whatever `initial` had already applied and the line
    would stay hidden. Only the travel distance varies.
  */
  const hidden = { opacity: 0, y: reduced ? "0%" : "108%" };
  const shown = { opacity: 1, y: "0%" };

  return (
    <Tag ref={ref as never} className={cn("block", className)}>
      {lines.map((line, i) => (
        <span key={`${line}-${i}`} className="block overflow-hidden pb-[0.06em]">
          <motion.span
            className="block"
            initial={hidden}
            animate={play ? shown : hidden}
            transition={{
              duration: 1,
              ease: EASE,
              delay: delay + i * stagger,
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
