import { motion, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * Мягкое «пятно» за курсором (как на многих студийных сайтах). Отключено при coarse pointer и reduced motion.
 */
export function CursorGlow() {
  const [active, setActive] = useState(false);
  const x = useSpring(0, { stiffness: 120, damping: 28, mass: 0.4 });
  const y = useSpring(0, { stiffness: 120, damping: 28, mass: 0.4 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    setActive(true);

    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [x, y]);

  if (!active) return null;

  return (
    <motion.div
      className="pointer-events-none fixed z-30 h-[min(55vw,420px)] w-[min(55vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/11 blur-[72px] mix-blend-screen"
      style={{ left: x, top: y }}
      aria-hidden
    />
  );
}
