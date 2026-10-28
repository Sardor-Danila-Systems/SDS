"use client";

import { useEffect, useRef, useState } from "react";
import { PRELOADER_EVENT, PRELOADER_KEY } from "./preloader-shared";

/**
 * The opening of the site.
 *
 * A black screen with a faint grid of dots. A blue tide rises through it and
 * the dots under the water swell into a halftone gradient — dots near the
 * surface, diamonds, then solid squares at depth — while a number counts up to
 * 100. At 100 the dots shrink away from the top down and the whole screen
 * lifts off like a curtain, onto the hero.
 *
 * It plays once per browser session, only on the home page, never under
 * reduced motion, and any click, key press or scroll sends it off at once. An
 * inline script in the layout decides all of that before first paint (the
 * `sds-no-preloader` class), so a skipped preloader never flashes.
 */

const FILL_MS = 1900;
const COLLAPSE_MS = 650;
const SLIDE_MS = 850;

const INK = "#0b0b0c";
const BLUE = "#116bff";
const LIGHT = "#7fb0ff";
const DIM = "rgba(255,255,255,0.13)";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

declare global {
  interface Window {
    __sdsPreloaderDone?: boolean;
  }
}

/** Tells the hero it may start. A flag as well as an event: it may not be listening yet. */
function announce(played: boolean) {
  window.__sdsPreloaderDone = true;
  try {
    sessionStorage.setItem(PRELOADER_KEY, "1");
  } catch {
    /* private mode — it simply plays again next visit */
  }
  window.dispatchEvent(new CustomEvent(PRELOADER_EVENT, { detail: { played } }));
}

export function Preloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;

    if (document.documentElement.classList.contains("sds-no-preloader")) {
      announce(false);
      setGone(true);
      return;
    }

    const html = document.documentElement;
    html.style.overflow = "hidden";

    let w = 0;
    let h = 0;
    let dpr = 1;
    let gap = 14;
    let raf = 0;
    let start = 0;
    let skippedAt: number | null = null;
    let finished = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gap = w < 640 ? 12 : 14;
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      html.style.overflow = "";
      announce(true);
      setGone(true);
    };

    const frame = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      // A skip jumps straight to the lift-off, so the curtain still moves.
      const slideStart = FILL_MS + COLLAPSE_MS;
      const slideT =
        skippedAt !== null
          ? Math.min(1, (now - skippedAt) / (SLIDE_MS * 0.6))
          : Math.min(1, Math.max(0, (elapsed - slideStart) / SLIDE_MS));

      const fill = skippedAt !== null ? 1 : Math.min(1, elapsed / FILL_MS);
      const p = easeInOut(fill);
      const collapse = skippedAt !== null ? 1 : Math.min(1, Math.max(0, (elapsed - FILL_MS) / COLLAPSE_MS));
      const t = elapsed / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);

      const cols = Math.ceil(w / gap);
      const rows = Math.ceil(h / gap);
      const dim = new Path2D();
      const light = new Path2D();
      const blue = new Path2D();

      for (let j = 0; j < rows; j++) {
        const y = (j + 0.5) * gap;
        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) * gap;

          // The waterline: a slow swell plus a little per-column roughness.
          const edge =
            h * (1 - p) * 1.02 +
            Math.sin(x * 0.011 + t * 2.6) * h * 0.016 +
            Math.sin(x * 0.037 - t * 4.1) * h * 0.007 +
            (hash(i, 7) - 0.5) * gap * 0.8;

          const inside = fill >= 1 || y >= edge;
          if (!inside) {
            dim.moveTo(x + 1.1, y);
            dim.arc(x, y, 1.1, 0, Math.PI * 2);
            continue;
          }

          // Depth below the surface sets the halftone: small dots at the
          // top of the water, solid squares far down.
          const depth = fill >= 1 ? 1 : Math.min(1, (y - edge) / (h * 0.55));
          const body = 0.28 + 0.72 * smooth(0, 0.7, depth);
          // Once full, the dots shrink away from the top down.
          const gone = smooth(0, 0.5, collapse * 1.5 - (y / h) * 0.9 - hash(i, j) * 0.25);
          const r = gap * 0.5 * body * (1 - gone);
          if (r < 0.5) {
            dim.moveTo(x + 1.1, y);
            dim.arc(x, y, 1.1, 0, Math.PI * 2);
            continue;
          }

          const path = depth < 0.1 && fill < 1 ? light : blue;
          if (depth < 0.22) {
            path.moveTo(x + r, y);
            path.arc(x, y, r, 0, Math.PI * 2);
          } else if (depth < 0.55) {
            path.moveTo(x, y - r * 1.05);
            path.lineTo(x + r * 0.82, y);
            path.lineTo(x, y + r * 1.05);
            path.lineTo(x - r * 0.82, y);
            path.closePath();
          } else {
            path.rect(x - r * 0.92, y - r * 0.92, r * 1.84, r * 1.84);
          }
        }
      }

      ctx.fillStyle = DIM;
      ctx.fill(dim);
      ctx.fillStyle = LIGHT;
      ctx.fill(light);
      ctx.fillStyle = BLUE;
      ctx.fill(blue);

      if (counterRef.current) {
        counterRef.current.textContent = String(Math.round(p * 100)).padStart(3, "0");
      }

      // The curtain lifts: the whole layer slides up and off.
      root.style.transform = `translateY(${-100 * easeInOut(slideT)}%)`;

      if (slideT >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const skip = () => {
      if (skippedAt === null) skippedAt = performance.now();
    };
    const onKey = () => skip();

    resize();
    window.addEventListener("resize", resize);
    root.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = "";
      window.removeEventListener("resize", resize);
      root.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="sds-preloader fixed inset-0 z-[100] overflow-hidden bg-ink text-white will-change-transform"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60 sm:px-10 sm:pt-8">
        <span className="text-[0.9375rem] font-semibold normal-case tracking-[-0.04em] text-white">SDS</span>
        <span>Sardor &amp; Danila Systems</span>
      </div>

      <span
        ref={counterRef}
        className="pointer-events-none absolute bottom-3 left-5 font-sans font-extrabold leading-[0.8] tracking-[-0.04em] tabular-nums sm:bottom-5 sm:left-9"
        style={{
          fontSize: "min(300px, 34vw, 38vh)",
          fontFamily: "var(--font-onest), system-ui, sans-serif",
          mixBlendMode: "difference",
        }}
      >
        000
      </span>
    </div>
  );
}
