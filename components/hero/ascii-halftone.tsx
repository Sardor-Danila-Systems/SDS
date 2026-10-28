"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's halftone scene.
 *
 * The SDS wordmark is read from the logo, turned into a coverage map, and
 * drawn as a grid of round dots whose size follows the coverage — the
 * "halftone" look of ASCII generators, but live. The word is a thin slab seen
 * in perspective: it sways on two axes, and a few layers behind the face give
 * it thickness. It assembles out of falling dots, a light band travels across
 * it, and dots swell near the pointer.
 *
 * Nothing here is a library: one canvas, one rAF loop, ~15k dots a frame. The
 * loop pauses off-screen and on hidden tabs, and under reduced motion it draws
 * a single still frame.
 */

const LOGO_SRC = "/logo.png";
// The "SDS" letters inside the round logo, in source pixels.
const CROP = { x: 170, y: 410, w: 930, h: 300 };
const TEX_W = 220;
const TEX_H = Math.round((TEX_W * CROP.h) / CROP.w);

const LAYERS = 7;
const DEPTH = 0.09; // slab thickness, as a fraction of the word's width
const REVEAL_MS = 1900;

interface Textures {
  /** Ink coverage of the letters, 0..1. */
  mask: Float32Array;
  /** Share of "blue" in the letters, 0..1 — the D is drawn in the accent. */
  accent: Float32Array;
}

function buildTextures(image: HTMLImageElement): Textures {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  // Scaling down averages neighbouring pixels, which is the filtering we want.
  ctx.drawImage(image, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, TEX_W, TEX_H);
  const { data } = ctx.getImageData(0, 0, TEX_W, TEX_H);

  const mask = new Float32Array(TEX_W * TEX_H);
  const accent = new Float32Array(TEX_W * TEX_H);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const white = Math.min(r, g, b) / 255;
    const blue = Math.max(0, b - r) / 255;
    // Letters are either white or bright blue on a near-black field.
    const m = Math.min(1, Math.max(white, blue * 1.15));
    mask[i] = m < 0.12 ? 0 : m;
    accent[i] = m > 0.12 ? Math.min(1, blue / Math.max(m, 0.01)) : 0;
  }
  return { mask, accent };
}

function sample(tex: Float32Array, u: number, v: number) {
  const x = u * (TEX_W - 1);
  const y = v * (TEX_H - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(TEX_W - 1, x0 + 1);
  const y1 = Math.min(TEX_H - 1, y0 + 1);
  const a = tex[y0 * TEX_W + x0]!;
  const b = tex[y0 * TEX_W + x1]!;
  const c = tex[y1 * TEX_W + x0]!;
  const d = tex[y1 * TEX_W + x1]!;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Cheap deterministic noise in 0..1 — the same dot always rolls the same. */
function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function AsciiHalftone({
  onIntroEnd,
  introMs,
  className,
}: {
  /** Called once, when the opening scene is over. */
  onIntroEnd: () => void;
  introMs: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endRef = useRef(onIntroEnd);
  endRef.current = onIntroEnd;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let textures: Textures | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cell = 10;
    let raf = 0;
    let visible = true;
    let ended = false;
    let startedAt = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--foreground").trim() || "#0b0b0c";
    const accentColor = style.getPropertyValue("--primary").trim() || "#116bff";

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Finer on large screens, coarser on phones, so the dot count stays sane.
      cell = width < 640 ? 8 : width < 1280 ? 10 : 12;
    }

    function frame(now: number) {
      if (!textures) return;
      if (!startedAt) startedAt = now;
      const elapsed = reduced ? REVEAL_MS + 1200 : now - startedAt;
      const t = elapsed / 1000;
      const reveal = Math.min(1, elapsed / REVEAL_MS);

      if (!ended && elapsed >= introMs) {
        ended = true;
        endRef.current();
      }

      ctx!.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const aspect = width / height;

      // Camera and the word's pose. It starts face-on, then begins to sway.
      const sway = smooth(0.4, 2.4, t);
      const yaw = (0.46 * Math.sin(t * 0.55) + 0.08) * sway;
      const pitch = 0.16 * Math.sin(t * 0.43 + 1) * sway;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);

      // A distant, narrow camera keeps the perspective gentle: the near edge
      // of the turning word must stay inside the view.
      const camZ = 4.2;
      const fov = 0.38;
      // The word spans ~80% of the view on phones, ~66% on desktop.
      const visibleW = 2 * fov * aspect * camZ;
      const worldW = visibleW * (width < 640 ? 0.82 : 0.6);
      const worldH = (worldW * TEX_H) / TEX_W;

      const inkPath = new Path2D();
      const accentPath = new Path2D();
      const light = ((t * 0.35) % 2) - 0.5; // travelling band, in view widths

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const px = (i + 0.5) * cell;
          const py = (j + 0.5) * cell;
          const nx = (px / width - 0.5) * 2;
          const ny = (0.5 - py / height) * 2;

          // Ray through this cell, from the camera at (0, 0, camZ).
          let dx = nx * fov * aspect;
          let dy = ny * fov;
          let dz = -1;
          // Into the word's space: inverse yaw, then inverse pitch.
          let ox = 0;
          let oy = 0;
          let oz = camZ;
          let tx = cy * dx - sy * dz;
          let tz = sy * dx + cy * dz;
          dx = tx;
          dz = tz;
          tx = cy * ox - sy * oz;
          tz = sy * ox + cy * oz;
          ox = tx;
          oz = tz;
          let ty = cp * dy + sp * dz;
          tz = -sp * dy + cp * dz;
          dy = ty;
          dz = tz;
          ty = cp * oy + sp * oz;
          tz = -sp * oy + cp * oz;
          oy = ty;
          oz = tz;

          let coverage = 0;
          let blue = 0;
          if (Math.abs(dz) > 1e-4) {
            for (let k = 0; k < LAYERS; k++) {
              const z = -(k / (LAYERS - 1)) * DEPTH * worldW;
              const s = (z - oz) / dz;
              if (s <= 0) continue;
              const hx = ox + dx * s;
              const hy = oy + dy * s;
              const u = hx / worldW + 0.5;
              const v = 0.5 - hy / worldH;
              if (u < 0 || u > 1 || v < 0 || v > 1) continue;
              const m = sample(textures.mask, u, v);
              if (m > 0.3) {
                // Front face is solid; the slab behind it fades with depth.
                const shade = k === 0 ? 1 : 0.78 - (k / LAYERS) * 0.38;
                coverage = Math.min(1, m * shade * 1.1);
                blue = sample(textures.accent, u, v);
                break;
              }
            }
          }

          // Assembly: dots arrive from the centre outwards, with jitter, over
          // a thin rain of stray dots that fades as the word forms.
          const noise = hash(i, j);
          const dist = Math.hypot(nx * aspect, ny) / (aspect + 1);
          const arrive = smooth(0, 0.28, reveal * 1.5 - dist * 1.1 - noise * 0.45);
          let radius = coverage * arrive;
          if (reveal < 1) {
            const drop = hash(i, j, Math.floor(t * 9 + j * 0.25));
            if (drop > 0.968) radius = Math.max(radius, 0.42 * (1 - reveal));
          }

          // Travelling light band and a slow breathing swell.
          const band = 1 - Math.min(1, Math.abs(px / width + py / height * 0.35 - light) * 7);
          radius *= 1 + 0.22 * band * smooth(0.6, 1, reveal) + 0.05 * Math.sin(t * 1.6 + i * 0.2);

          // The pointer wakes the grid up around it.
          if (pointer.active) {
            const ddx = px - pointer.x;
            const ddy = py - pointer.y;
            const fall = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * 95 * 95));
            radius = Math.max(radius * (1 + 0.8 * fall), 0.34 * fall);
          }

          const r = Math.min(0.62, radius) * cell * 0.92;
          if (r < 0.45) continue;
          const path = blue > 0.5 ? accentPath : inkPath;
          path.moveTo(px + r, py);
          path.arc(px, py, r, 0, Math.PI * 2);
        }
      }

      ctx!.fillStyle = ink;
      ctx!.fill(inkPath);
      ctx!.fillStyle = accentColor;
      ctx!.fill(accentPath);
    }

    // While the page is being scrolled the scene holds still: the header
    // blurs whatever is behind it, and repainting an animated canvas under a
    // blur on every frame is exactly what makes scrolling heavy.
    let scrolled = window.scrollY > 4;

    function loop(now: number) {
      raf = 0;
      if (!visible || document.hidden || scrolled) return;
      frame(now);
      raf = requestAnimationFrame(loop);
    }

    const onScroll = () => {
      const next = window.scrollY > 4;
      if (next === scrolled) return;
      scrolled = next;
      if (!scrolled) start();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    function start() {
      if (raf || reduced) return;
      raf = requestAnimationFrame(loop);
    }

    const image = new Image();
    image.onload = () => {
      textures = buildTextures(image);
      resize();
      if (reduced) {
        frame(performance.now());
        ended = true;
        endRef.current();
      } else {
        start();
      }
    };
    image.src = LOGO_SRC;

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduced && textures) frame(performance.now());
    });
    resizeObserver.observe(canvas);

    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
    });
    visibility.observe(canvas);

    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active =
        event.pointerType !== "touch" &&
        pointer.y >= 0 &&
        pointer.y <= rect.height;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibility.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [introMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  );
}
