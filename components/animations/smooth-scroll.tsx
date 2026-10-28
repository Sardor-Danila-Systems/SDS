"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { registerLenis, scrollToHash } from "@/lib/scroll";

/**
 * Inertial wheel scrolling on pointer devices.
 *
 * Deliberately narrow: skipped on touch (native momentum is better there) and
 * under `prefers-reduced-motion`. Nothing in the layout depends on it — if it
 * never starts, `scrollToSection` falls back to the platform.
 */
export function SmoothScroll() {
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!finePointer || reduced) {
      // Still honour a hash arriving from another route.
      scrollToHash();
      return;
    }

    const lenis = new Lenis({
      duration: 0.85,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    registerLenis(lenis);

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // Landing on /#projects from a case study should settle on the section.
    scrollToHash();

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      registerLenis(null);
    };
  }, []);

  return null;
}
