import type MuxPlayerElement from '@mux/mux-player';
import MuxPlayer from '@mux/mux-player-react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const STACK = ['React', 'Next.js', 'TypeScript', 'PostgreSQL'] as const;

const MUX_PLAYBACK_ID = 'AKIkrWZorKEeQI024uCe01jjvgoPaMgZVe00MO8Vp1DpQs';

export default function Hero() {
  const { t } = useTranslation();
  const muxRef = useRef<MuxPlayerElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, -72]);

  const restartLoop = () => {
    const el = muxRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  };

  return (
    <section
      ref={sectionRef}
      className="relative -mt-px overflow-x-clip pt-28 pb-16 lg:min-h-[min(90vh,920px)] lg:pb-28"
    >
      <div className="pointer-events-none absolute -top-px right-0 bottom-0 left-0 z-0 overflow-hidden">
        <MuxPlayer
          ref={muxRef}
          playbackId={MUX_PLAYBACK_ID}
          metadata={{ video_title: 'sss' }}
          title="sss"
          videoTitle="sss"
          autoPlay="muted"
          muted
          loop
          playsInline
          nohotkeys
          disablePseudoEnded
          proudlyDisplayMuxBadge={false}
          className="absolute top-1/2 left-1/2 w-[min(180vw,320vh)] max-w-none -translate-x-1/2 -translate-y-1/2 sm:w-[min(140vw,260vh)] lg:w-[min(115vw,220vh)]"
          style={{
            aspectRatio: '13 / 5',
            ['--controls' as string]: 'none',
            ['--media-object-fit' as string]: 'cover',
          }}
          onEnded={restartLoop}
        />
      </div>
      <div
        className="pointer-events-none absolute -top-px right-0 bottom-0 left-0 z-1 bg-linear-to-b from-[#0f172a]/42 via-[#0f172a]/28 to-[#0f172a]/48"
        aria-hidden
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge
              variant="outline"
              className="mb-6 h-auto min-h-5 max-w-full whitespace-normal border-primary/25 bg-primary/5 px-3 py-1.5 text-left text-[10px] leading-snug font-semibold tracking-[0.16em] text-primary uppercase sm:text-[11px]"
            >
              {t('hero.badge')}
            </Badge>
            <h1 className="mb-6 font-heading text-[2.65rem] leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="text-gradient">{t('hero.titleBefore')}</span>{' '}
              <span className="text-foreground">{t('hero.titleHighlight')}</span>
            </h1>
            <p className="mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground lg:text-xl">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="h-11 rounded-xl px-7 text-base font-semibold" asChild>
                <a href="#contact" className="gap-2">
                  {t('hero.primaryCta')}
                  <ArrowRight className="size-4 transition-transform group-hover/button:translate-x-0.5" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="h-11 rounded-xl border-border/80 px-7 text-base font-semibold" asChild>
                <a href="#portfolio">{t('hero.secondaryCta')}</a>
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <span className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
                {t('hero.stackLabel')}
              </span>
              <Separator orientation="vertical" className="hidden h-4! sm:block" decorative />
              <div className="flex flex-wrap gap-2">
                {STACK.map((tech) => (
                  <span key={tech} className="tech-tag">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div style={{ y: parallaxY }} className="relative flex justify-center lg:justify-end">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex justify-center lg:justify-end"
            >
            <div className="accent-glow relative z-10 hidden w-full max-w-md rounded-2xl border border-border/80 bg-card/40 p-1 ring-1 ring-foreground/5 md:block md:max-w-lg">
              <div className="overflow-hidden rounded-[0.9rem] bg-background/80">
                <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2.5">
                  <span className="size-2 rounded-full bg-muted-foreground/25" />
                  <span className="size-2 rounded-full bg-muted-foreground/25" />
                  <span className="size-2 rounded-full bg-muted-foreground/25" />
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">preview — internal</span>
                </div>
                <div className="grid grid-cols-3 gap-3 p-5">
                  <div className="col-span-2 h-36 rounded-xl bg-muted/30 ring-1 ring-inset ring-foreground/5" />
                  <div className="h-36 rounded-xl bg-muted/20 ring-1 ring-inset ring-foreground/5" />
                  <div className="h-24 rounded-xl bg-primary/15 ring-1 ring-inset ring-primary/20" />
                  <div className="h-24 rounded-xl bg-muted/25 ring-1 ring-inset ring-foreground/5" />
                  <div className="h-24 rounded-xl bg-muted/20 ring-1 ring-inset ring-foreground/5" />
                </div>
              </div>
            </div>

            <Card className="absolute -bottom-6 -left-4 z-20 hidden w-52 border-border/80 bg-card/90 shadow-2xl backdrop-blur-md md:block md:w-56">
              <CardContent className="flex flex-col gap-3 pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-primary/20 ring-1 ring-primary/30" />
                  <div className="flex-1 space-y-2">
                    <div className="h-2.5 w-3/4 rounded-full bg-muted" />
                    <div className="h-2.5 w-1/2 rounded-full bg-muted/70" />
                  </div>
                </div>
                <div className="h-24 rounded-xl bg-linear-to-br from-primary/15 to-transparent ring-1 ring-primary/15" />
              </CardContent>
            </Card>

            <div
              className="absolute top-1/2 left-1/2 -z-10 h-[min(100%,420px)] w-[min(100%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[100px]"
              aria-hidden
            />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
