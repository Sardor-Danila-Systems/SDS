"use client";

import { useEffect, useRef, useState } from "react";
import { GlassFold } from "@/components/ui/glass-fold";
import {
  ImageStreamHero,
  type StreamImage,
} from "@/components/ui/image-stream-hero";

/**
 * Every project flying out of a dark, blue-lit glass fold toward the viewer.
 * The shader only runs while the panel is near the screen.
 */
export function ProjectStream({ images }: { images: StreamImage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "150px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative isolate aspect-[16/10] max-h-[680px] w-full overflow-hidden rounded-lg bg-ink"
    >
      {near ? (
        <GlassFold
          className="absolute inset-0 opacity-80"
          color1="#0d4fc4"
          color2="#0b0b0c"
          color3="#4d93ff"
          speed={0.35}
          scale={0.9}
          noise={0.08}
        />
      ) : null}
      <ImageStreamHero
        images={images}
        cards={14}
        speed={30}
        axis={52}
        path={{ cardWidth: 27, cardHeight: 17, exitHeight: 34, railExit: 40 }}
        className="absolute inset-0"
      />
      {/* Soft vignette so the card edges melt into the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(11,11,12,0.7)_100%)]"
      />
    </div>
  );
}
