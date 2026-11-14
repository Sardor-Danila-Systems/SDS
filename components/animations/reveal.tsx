"use client";

import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";

/*
  Motion vocabulary for the whole site: fade, a short rise, a stagger, and an
  image that uncovers itself. Nothing rotates, nothing loops, nothing scales
  more than a couple of percent. Every helper collapses to a plain fade when
  the visitor asks for reduced motion.

  The viewport trigger only shrinks its *bottom* edge — shrinking the top edge
  would leave anything rendered high on the screen stuck at opacity 0.
*/

export const EASE: Transition["ease"] = [0.16, 1, 0.3, 1];
const DURATION = 0.7;
const VIEWPORT = { once: true, margin: "0px 0px -12% 0px" } as const;

type Tag =
  | "div"
  | "section"
  | "article"
  | "ul"
  | "ol"
  | "li"
  | "span"
  | "p"
  | "header"
  | "figure";

export type From = "up" | "left" | "right";

/** Horizontal travel in px for side entrances. */
const SIDE = 56;

/**
 * Hidden state for an entrance direction. Every direction lists the same
 * properties (opacity, x, y, filter) so the target always clears `initial`,
 * whatever `useReducedMotion` resolves to after hydration.
 */
function hiddenState(from: From, reduced: boolean, y: number) {
  return {
    opacity: 0,
    x: reduced ? 0 : from === "left" ? -SIDE : from === "right" ? SIDE : 0,
    y: reduced ? 0 : from === "up" ? y : 0,
    filter: reduced ? "blur(0px)" : "blur(6px)",
  };
}

const SHOWN = { opacity: 1, x: 0, y: 0, filter: "blur(0px)" };

export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  from = "up",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Direction the element arrives from. */
  from?: From;
  as?: Tag;
}) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  return (
    <MotionTag
      className={className}
      initial={hiddenState(from, !!reduced, y)}
      whileInView={SHOWN}
      viewport={VIEWPORT}
      transition={{ duration: DURATION + 0.1, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      {children}
    </MotionTag>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  id,
  from = "up",
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
  id?: string;
  from?: From;
}) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  const itemVariants: Variants = {
    hidden: hiddenState(from, !!reduced, 14),
    show: { ...SHOWN, transition: { duration: DURATION + 0.1, ease: EASE } },
  };

  return (
    <MotionTag id={id} className={cn(className)} variants={itemVariants}>
      {children}
    </MotionTag>
  );
}

/**
 * Uncovers its children from the bottom edge — used for screenshots, so the
 * interface appears rather than slides.
 */
export function RevealImage({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.5, delay }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ clipPath: "inset(14% 0% 0% 0%)", opacity: 0 }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.95, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A hairline that draws itself across the section when it comes into view. */
export function DrawLine({
  className,
  delay = 0,
  orientation = "horizontal",
}: {
  className?: string;
  delay?: number;
  orientation?: "horizontal" | "vertical";
}) {
  const reduced = useReducedMotion();
  const axis = orientation === "horizontal" ? "scaleX" : "scaleY";

  // Same rule as AnimatedText: both states list the same properties, so a
  // post-hydration flip of `reduced` can never strand the line at scale 0.
  return (
    <motion.div
      aria-hidden
      className={cn("bg-border", className)}
      style={{ transformOrigin: orientation === "horizontal" ? "left" : "top" }}
      initial={{ opacity: 0, [axis]: reduced ? 1 : 0 }}
      whileInView={{ opacity: 1, [axis]: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 1, ease: EASE, delay }}
    />
  );
}
