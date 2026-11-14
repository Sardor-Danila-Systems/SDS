import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import {
  DrawLine,
  Reveal,
  Stagger,
  StaggerItem,
  type From,
} from "@/components/animations/reveal";
import { AnimatedText } from "@/components/animations/animated-text";
import { services } from "@/data/services";
import { techGroups } from "@/data/tech";

/** Cards enter from the outside in: left edge from the left, right edge from the right. */
function directionFor(i: number, total: number): From {
  const mid = (total - 1) / 2;
  if (i < mid) return "left";
  if (i > mid) return "right";
  return "up";
}

/**
 * About: one statement, the five directions, the team and the stack.
 * Everything arrives from a side — labels from the left, copy from the right —
 * so the section reads as two columns converging on the statement.
 */
export function AboutSection() {
  const t = useTranslations("About");
  const tServices = useTranslations("Services");
  const statement = t.raw("statementLines") as string[];
  const stack = techGroups.flatMap((group) => group.items);

  return (
    <Section id="about">
      <Container>
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-3">
            <Reveal from="left" className="flex items-center gap-4">
              <span aria-hidden className="h-px w-8 bg-primary" />
              <span className="label">{t("label")}</span>
            </Reveal>
          </div>

          <div className="md:col-span-9">
            <p className="display-2 text-balance">
              <AnimatedText lines={statement} trigger="inView" as="span" />
            </p>

            <Reveal from="right" delay={0.2}>
              <p className="lead mt-6 max-w-2xl text-pretty text-muted-foreground">
                {t("body")}
              </p>
            </Reveal>
          </div>
        </div>

        {/* The five directions. */}
        <div className="mt-12 lg:mt-16">
          <DrawLine className="h-px bg-border-strong" />
          <Stagger
            as="ul"
            className="grid sm:grid-cols-2 lg:grid-cols-5"
          >
            {services.map((service, i) => (
              <StaggerItem
                key={service.id}
                as="li"
                from={directionFor(i, services.length)}
                className="group relative border-b border-border py-7 sm:pr-8 lg:border-b-0 lg:pr-6"
              >
                {/* Accent rule that draws across on hover. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-x-100"
                />
                <div className="flex items-center justify-between">
                  <span className="num text-subtle-foreground transition-colors duration-300 group-hover:text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="size-4 -translate-x-2 translate-y-2 text-primary opacity-0 transition-all duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
                  />
                </div>
                <h3 className="mt-6 text-xl tracking-[-0.025em] transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-1">
                  {tServices(`items.${service.id}.title`)}
                </h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {tServices(`items.${service.id}.summary`)}
                </p>
              </StaggerItem>
            ))}
          </Stagger>
          <DrawLine className="h-px bg-border" delay={0.2} />
        </div>

        {/* Team and stack. */}
        <div className="mt-12 grid gap-8 md:grid-cols-12 md:gap-8 lg:mt-14">
          <Reveal from="left" className="md:col-span-4">
            <span className="label">{t("teamLabel")}</span>
            <p className="display-3 mt-5 max-w-sm text-balance">{t("team")}</p>
          </Reveal>

          <div className="md:col-span-7 md:col-start-6">
            <Reveal from="right">
              <span className="label">{t("stackLabel")}</span>
            </Reveal>
            <Stagger as="ul" className="mt-5 flex flex-wrap gap-2.5">
              {stack.map((item, i) => (
                <StaggerItem
                  key={item}
                  as="li"
                  from={i % 2 === 0 ? "right" : "up"}
                  className="rounded-full border border-border-strong px-4 py-1.5 text-[0.9375rem] tracking-[-0.02em] text-muted-foreground transition-colors duration-300 hover:border-primary hover:bg-primary-soft hover:text-primary"
                >
                  {item}
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </Container>
    </Section>
  );
}
