"use client";

import { useEffect, useRef, useState } from "react";
import { GlassFold } from "@/components/ui/glass-fold";

/**
 * Quiet WebGL backdrop for the dark closing section, tinted from the logo
 * blue. It only mounts while the section is near the viewport, so the shader
 * never burns frames offscreen, and a dark veil keeps all copy legible.
 */
export function GlassBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {near ? (
        <GlassFold
          className="absolute inset-0 opacity-50"
          color1="#0d4fc4"
          color2="#0b0b0c"
          color3="#4d93ff"
          speed={0.25}
          scale={0.8}
          noise={0.1}
        />
      ) : null}
      {/* Veil: keeps contrast for text and blends the edges into the ink surface. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink/55 to-ink/80" />
    </div>
  );
}
