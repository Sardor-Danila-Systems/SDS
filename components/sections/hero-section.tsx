"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/animations/reveal";
import { AnimatedText } from "@/components/animations/animated-text";
import { scrollToSection } from "@/lib/scroll";
import { HeroVisual } from "@/components/hero/hero-visual";
import { AsciiHalftone } from "@/components/hero/ascii-halftone";
import { cn } from "@/lib/utils";
import { PRELOADER_EVENT } from "@/components/layout/preloader-shared";

// Shorter when the site's opening has just played — two long intros in a row is too much.
const INTRO_MS = 4600;
const INTRO_AFTER_PRELOADER_MS = 3000;
const SEEN_KEY = "sds-hero-intro";

/**
 * The opening. A halftone scene plays on its own first — the SDS wordmark
 * assembling out of dots and turning in space — then the headline, line and
 * actions come in over it while it settles into the background.
 *
 * The text is in the HTML from the start (it is what search engines read) and
 * is only held back visually. The scene is skipped on a click, a key press or a
 * scroll, and on later visits in the same session.
 */
export function HeroSection() {
  const t = useTranslations("Hero");
  const tCommon = useTranslations("Common");
  const lines = t.raw("titleLines") as string[];

  const [revealed, setRevealed] = useState(false);
  // The scene starts only once the opening (if there is one) has lifted.
  const [stageReady, setStageReady] = useState(false);
  const [afterPreloader, setAfterPreloader] = useState(false);

  const reveal = useCallback(() => {
    setRevealed(true);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — the intro simply plays again next time */
    }
  }, []);

  useEffect(() => {
    if (window.__sdsPreloaderDone) {
      setStageReady(true);
      return;
    }
    const onDone = (event: Event) => {
      setAfterPreloader(Boolean((event as CustomEvent).detail?.played));
      setStageReady(true);
    };
    window.addEventListener(PRELOADER_EVENT, onDone);
    // Never leave the hero waiting on an opening that failed to report in.
    const fallback = window.setTimeout(() => setStageReady(true), 8000);
    return () => {
      window.removeEventListener(PRELOADER_EVENT, onDone);
      window.clearTimeout(fallback);
    };
  }, []);

  // Seen already this session: go straight to the finished hero.
  useEffect(() => {
    try {
      // `?intro` replays the opening, so the hero scene must play too.
      if (sessionStorage.getItem(SEEN_KEY) && !window.location.search.includes("intro")) {
        setRevealed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Any sign the visitor wants in ends the intro.
  useEffect(() => {
    if (revealed) return;
    const skip = () => reveal();
    window.addEventListener("wheel", skip, { passive: true, once: true });
    window.addEventListener("touchmove", skip, { passive: true, once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [revealed, reveal]);

  return (
    <section id="hero" className="pb-4">
      {/* Without JavaScript the intro never ends, so never hide the text. */}
      <noscript>
        <style>{".hero-held{visibility:visible!important}"}</style>
      </noscript>

      <div className="relative isolate flex min-h-[100svh] flex-col justify-end pb-14 pt-28 sm:pt-32 lg:pb-20 lg:pt-36">
        {stageReady ? (
          <AsciiHalftone
            introMs={afterPreloader ? INTRO_AFTER_PRELOADER_MS : INTRO_MS}
            onIntroEnd={reveal}
            className={cn(
              "absolute inset-0 -z-10 size-full transition-opacity duration-[1400ms] ease-out",
              "[mask-image:linear-gradient(to_bottom,black_72%,transparent)]",
              revealed ? "opacity-[0.26]" : "opacity-100",
            )}
          />
        ) : null}

        {!revealed ? (
          <button
            type="button"
            onClick={reveal}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("skip")}
          </button>
        ) : null}

        {/* Re-keyed when revealed, so the entrance animations play on reveal. */}
        <div
          key={revealed ? "shown" : "held"}
          className={cn(!revealed && "hero-held invisible")}
        >
          <Container>
            <Reveal y={0}>
              <div className="flex items-center justify-between gap-6 border-b border-border pb-5">
                <span className="label">{t("label")}</span>
                <span className="label">{tCommon("location")}</span>
              </div>
            </Reveal>

            <h1 className="display-0 mt-12 sm:mt-16 lg:mt-20">
              <AnimatedText lines={lines} />
            </h1>

            <div className="mt-12 grid items-end gap-8 md:grid-cols-12 lg:mt-16">
              <Reveal delay={0.32} className="md:col-span-6">
                <p className="lead max-w-lg text-pretty text-muted-foreground">
                  {t("subtitle")}
                </p>
              </Reveal>

              <Reveal delay={0.4} className="md:col-span-5 md:col-start-8">
                <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                  <button
                    type="button"
                    onClick={() => scrollToSection("projects")}
                    className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-md bg-primary px-6 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("primaryCta")}
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("contact")}
                    className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-md border border-border-strong px-6 text-[0.9375rem] font-medium transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("secondaryCta")}
                    <ArrowDown className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" />
                  </button>
                </div>
              </Reveal>
            </div>
          </Container>
        </div>
      </div>

      <HeroVisual />
    </section>
  );
}
