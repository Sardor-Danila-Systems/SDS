"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Colours of the field. The first is the ground; every other one is used for
 * the glyphs drawn on it.
 */
export type Signal404Palette = readonly [string, ...string[]];

const DEFAULT_PALETTE: Signal404Palette = ["#0000ff", "#ffffff"];

/**
 * Full-bleed 404 page: a field of dithered glyphs that drifts slowly behind an
 * oversized difference-blended numeral. Everything is drawn on a canvas, so the
 * component has no asset or stylesheet dependencies.
 *
 * Local changes from the original component: the colours, the numeral's face,
 * its accessible label, the size and the corner radius are props, a `children`
 * slot sits above the field, and the embedded display font is dropped in
 * favour of the host page's own face.
 */
export default function Signal404({
  palette = DEFAULT_PALETTE,
  fontFamily = '"Archivo", "Arial Black", "Helvetica Neue", system-ui, sans-serif',
  label = "404",
  height = "100dvh",
  radius = 0,
  className,
  style,
  children,
}: {
  palette?: Signal404Palette;
  /** Face of the big numeral. A heavy grotesque reads best. */
  fontFamily?: string;
  /** Accessible name of the heading. */
  label?: string;
  /** CSS height of the whole block. */
  height?: string;
  /** Corner radius, in px. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
  /** Drawn above the field, e.g. a message and a link. */
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteKey = palette.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const colors = paletteKey.split("|") as unknown as Signal404Palette;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TAU = Math.PI * 2;

    const settings = {
      seed: 3827,
      cells: 88,
      bands: 6,
      field: "figure" as "figure" | "relief" | "slope",
      wave: 0.45,
      tilt: -0.69,
      detail: 0.63,
      size: 0.79,
      edges: 0.7,
      flecks: 0.03,
      smears: 0.26,
      dots: 0.45,
      palette: colors,
      motion: { enabled: !reduced, mode: "drift", amount: 0.6, fps: 12, frames: 36 },
    };

    const interval = 1000 / settings.motion.fps;
    const marks = settings.palette.length > 1 ? settings.palette.slice(1) : [settings.palette[0]];
    let width = 0;
    let height = 0;
    let frame = 30;
    let animationOrigin = 0;
    let animationRequest = 0;
    let visible = true;

    const hash = (x: number, y: number, seed: number) => {
      let value =
        Math.imul(x | 0, 374761393) +
        Math.imul(y | 0, 668265263) +
        Math.imul(seed | 0, 1274126177);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      value ^= value >>> 16;
      return (value >>> 0) / 4294967296;
    };

    const noise = (x: number, y: number, seed: number) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const dx = x - x0;
      const dy = y - y0;
      const sx = dx * dx * (3 - 2 * dx);
      const sy = dy * dy * (3 - 2 * dy);
      const a = hash(x0, y0, seed);
      const b = hash(x0 + 1, y0, seed);
      const c = hash(x0, y0 + 1, seed);
      const d = hash(x0 + 1, y0 + 1, seed);
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };

    const random = (seed: number) => {
      let value = (seed >>> 0) || 1;
      return () => {
        value ^= value << 13;
        value >>>= 0;
        value ^= value >>> 17;
        value >>>= 0;
        value ^= value << 5;
        value >>>= 0;
        return value / 4294967296;
      };
    };

    const colorToRgb = (color: string): number[] => {
      const value = color.replace("#", "");
      return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) || 0);
    };

    const colorToCss = (rgb: number[]) =>
      `rgb(${rgb.map((channel) => Math.round(channel)).join(",")})`;

    const makeField = (phase: number) => {
      const { motion } = settings;
      const driftX =
        motion.enabled && motion.mode === "drift" ? Math.cos(phase) * motion.amount * 0.4 : 0;
      const driftY =
        motion.enabled && motion.mode === "drift" ? Math.sin(phase) * motion.amount * 0.4 : 0;
      const wave = settings.wave;
      const seedA = settings.seed * 7 + 1;
      const seedB = settings.seed * 7 + 2;
      const seedC = settings.seed * 7 + 3;
      const generator = random(
        (Math.imul(settings.seed, 2246822519) ^ 0x27d4eb2f) >>> 0,
      );
      const glyphs = ["square", "diamond", "ring", "x"];
      const bandGlyph: string[] = [];
      const bandInk: string[] = [];
      let previousGlyph = -1;
      let previousInk = -1;
      for (let band = 0; band < settings.bands; band += 1) {
        let glyphIndex = (generator() * glyphs.length) | 0;
        if (glyphIndex === previousGlyph) glyphIndex = (glyphIndex + 1) % glyphs.length;
        let inkIndex = (generator() * marks.length) | 0;
        if (inkIndex === previousInk) inkIndex = (inkIndex + 1) % marks.length;
        bandGlyph.push(glyphs[glyphIndex]);
        bandInk.push(marks[inkIndex]);
        previousGlyph = glyphIndex;
        previousInk = inkIndex;
      }

      const spine = 0.5 + (generator() - 0.5) * 0.2;
      const secondY = 0.55 + generator() * 0.3;
      const secondX = 0.3 + generator() * 0.4;
      const detailScale = 1 + settings.detail * 3;

      const scalar = (u: number, v: number) => {
        if (settings.field === "figure") {
          const widthAtV =
            0.16 +
            0.5 *
              wave *
              (0.3 +
                noise(v * detailScale * 1.6 + driftX + 3, 0.5 + driftY, seedA) +
                0.35 * noise(v * detailScale * 4 + driftY + 9, 1.5 + driftX, seedA));
          const centerAtV = spine + settings.tilt * (v - 0.5);
          const mainFigure = Math.abs(u - centerAtV) / widthAtV;
          const secondWidth =
            0.12 +
            0.36 *
              wave *
              (0.4 + noise(v * detailScale * 1.9 + driftX + 13, 2.5 + driftY, seedA));
          const secondFigure =
            Math.sqrt(
              ((u - secondX) / secondWidth) ** 2 +
                ((v - secondY) / (secondWidth * 1.6)) ** 2,
            ) * 0.9;
          return Math.min(1, mainFigure, secondFigure);
        }

        if (settings.field === "relief") {
          const value =
            0.65 *
              noise(
                u * detailScale * 1.3 + driftX + 5,
                (v + settings.tilt * u) * detailScale * 1.3 + driftY + 2,
                seedB,
              ) +
            0.35 *
              noise(
                u * detailScale * 3.1 + driftY + 8,
                (v + settings.tilt * u) * detailScale * 3.1 + driftX + 4,
                seedB,
              );
          return Math.min(1, Math.max(0, ((value - 0.2) / 0.6) * (0.6 + wave * 0.6)));
        }

        const slope =
          v +
          settings.tilt * (u - 0.5) +
          wave * 0.35 * (noise(u * detailScale * 1.5 + driftX + 7, 0.5 + driftY, seedC) - 0.5) * 2 +
          wave * 0.08 * (noise(u * detailScale * 6 + driftY + 3, 1.5 + driftX, seedC) - 0.5) * 2;
        return Math.min(1, Math.max(0, slope));
      };

      return { scalar, bandGlyph, bandInk };
    };

    const paint = (phase: number) => {
      if (!width || !height) return;

      const seed = settings.seed;
      const ground = settings.palette[0];
      const groundRgb = colorToRgb(ground);
      const dotColor = colorToCss(groundRgb.map((channel) => channel + (255 - channel) * 0.22));
      const { scalar, bandGlyph, bandInk } = makeField(phase);
      const columns = Math.max(8, settings.cells | 0);
      const cellSize = width / columns;
      const rows = Math.ceil(height / cellSize);
      const glyphSize = cellSize * settings.size;
      const bands = new Int8Array(columns * rows);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          let band = Math.floor(
            scalar((column + 0.5) / columns, (row + 0.5) / rows) * settings.bands,
          );
          if (band >= settings.bands) band = settings.bands - 1;
          bands[row * columns + column] = band;
        }
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = ground;
      context.fillRect(0, 0, width, height);
      context.lineCap = "butt";
      context.lineJoin = "miter";

      const smearStart = new Int16Array(rows);
      const smearLength = new Int16Array(rows);
      smearStart.fill(-1);
      for (let row = 0; row < rows; row += 1) {
        if (hash(row, 1, seed) < settings.smears) {
          smearStart[row] = Math.floor(hash(row, 2, seed) * columns);
          smearLength[row] = 3 + Math.floor(hash(row, 3, seed) * Math.min(14, columns * 0.2));
        }
      }

      for (let row = 0; row < rows; row += 1) {
        const y = (row + 0.5) * cellSize;
        for (let column = 0; column < columns; column += 1) {
          const x = (column + 0.5) * cellSize;
          const band = bands[row * columns + column];
          const randomCell = hash(column, row, seed);

          if (band === settings.bands - 1) {
            if (settings.dots > 0 && randomCell > settings.flecks * 0.4) {
              context.fillStyle = dotColor;
              context.beginPath();
              context.arc(
                x,
                y,
                Math.max(0.3, cellSize * 0.09 * settings.dots),
                0,
                TAU,
              );
              context.fill();
            } else if (settings.flecks > 0 && randomCell <= settings.flecks * 0.4) {
              context.fillStyle = marks[(hash(column, row + 7, seed) * marks.length) | 0];
              context.fillRect(
                x - glyphSize * 0.3,
                y - glyphSize * 0.3,
                glyphSize * 0.6,
                glyphSize * 0.6,
              );
            }
            continue;
          }

          let ink = bandInk[band];
          let kind = bandGlyph[band];
          if (randomCell < settings.flecks) {
            ink = marks[(hash(column, row + 7, seed) * marks.length) | 0];
            kind = "square";
          } else {
            const right = column + 1 < columns ? bands[row * columns + column + 1] : band;
            const left = column > 0 ? bands[row * columns + column - 1] : band;
            const below = row + 1 < rows ? bands[(row + 1) * columns + column] : band;
            const above = row > 0 ? bands[(row - 1) * columns + column] : band;
            const edge = right !== band || left !== band || below !== band || above !== band;
            if (edge && hash(column, row + 3, seed) < settings.edges) {
              kind = "x";
              const currentInk = Math.max(0, marks.indexOf(ink));
              const offset =
                1 + ((hash(column, row + 11, seed) * (marks.length - 1)) | 0);
              ink = marks[(currentInk + offset) % marks.length];
            }
          }

          if (
            smearStart[row] >= 0 &&
            column >= smearStart[row] &&
            column < smearStart[row] + smearLength[row]
          ) {
            context.fillStyle = ink;
            context.fillRect(
              x - cellSize * 0.5,
              y - glyphSize * 0.32,
              cellSize + 0.5,
              glyphSize * 0.64,
            );
            continue;
          }

          context.fillStyle = ink;
          if (kind === "square") {
            context.fillRect(x - glyphSize * 0.5, y - glyphSize * 0.5, glyphSize, glyphSize);
          } else if (kind === "diamond") {
            const h = glyphSize * 0.55;
            context.beginPath();
            context.moveTo(x, y - h);
            context.lineTo(x + h * 0.78, y);
            context.lineTo(x, y + h);
            context.lineTo(x - h * 0.78, y);
            context.closePath();
            context.fill();
          } else if (kind === "ring") {
            context.fillRect(x - glyphSize * 0.5, y - glyphSize * 0.5, glyphSize, glyphSize);
            context.strokeStyle = ground;
            context.lineWidth = Math.max(0.6, glyphSize * 0.1);
            context.beginPath();
            context.arc(x, y, glyphSize * 0.3, 0, TAU);
            context.stroke();
            context.fillStyle = ground;
            context.beginPath();
            context.arc(x, y, glyphSize * 0.1, 0, TAU);
            context.fill();
          } else if (kind === "x") {
            context.strokeStyle = ink;
            context.lineWidth = Math.max(0.6, glyphSize * 0.16);
            const h = glyphSize * 0.36;
            context.beginPath();
            context.moveTo(x - h, y - h);
            context.lineTo(x + h, y + h);
            context.moveTo(x + h, y - h);
            context.lineTo(x - h, y + h);
            context.stroke();
          }
        }
      }
    };

    const draw = () => paint((frame / settings.motion.frames) * TAU);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(bounds.width * scale));
      height = Math.max(1, Math.round(bounds.height * scale));
      canvas.width = width;
      canvas.height = height;
      draw();
    };

    const animate = (time: number) => {
      animationRequest = 0;
      if (!visible || document.hidden) return;
      const nextFrame =
        Math.floor((time - animationOrigin) / interval) % settings.motion.frames;
      if (nextFrame !== frame) {
        frame = nextFrame;
        draw();
      }
      animationRequest = window.requestAnimationFrame(animate);
    };

    const start = () => {
      if (animationRequest || !settings.motion.enabled) return;
      animationRequest = window.requestAnimationFrame(animate);
    };

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    // Stop drawing when the field is off-screen or the tab is hidden.
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
    });
    visibility.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    animationOrigin = performance.now() - frame * interval;
    start();

    return () => {
      window.cancelAnimationFrame(animationRequest);
      animationRequest = 0;
      resizeObserver?.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [paletteKey]);

  return (
    <div
      data-slot="signal-404"
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height,
        minHeight: 420,
        overflow: "hidden",
        isolation: "isolate",
        background: palette[0],
        borderRadius: radius,
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: palette[0],
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
      <h1
        aria-label={label}
        style={{
          position: "absolute",
          zIndex: 1,
          top: "50%",
          left: "50%",
          margin: 0,
          transform: "translate(-50%, -50%)",
          color: "#fff",
          fontFamily,
          fontSize: "min(500px, 44vw, 52vh)",
          fontWeight: 900,
          letterSpacing: "-0.02em",
          lineHeight: 0.78,
          mixBlendMode: "difference",
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        404
      </h1>
      {children ? <div style={{ position: "absolute", zIndex: 2, inset: 0, pointerEvents: "none" }}>{children}</div> : null}
    </div>
  );
}
