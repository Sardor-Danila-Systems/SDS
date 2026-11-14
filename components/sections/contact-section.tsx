import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/animations/reveal";
import { AnimatedText } from "@/components/animations/animated-text";
import { GlassBackdrop } from "./glass-backdrop";
import { ContactForm } from "./contact-form";

/**
 * The closing section, on the inverted surface. Kept complete rather than
 * compressed: the form, plus every channel we actually answer on.
 */
export function ContactSection() {
  const t = useTranslations("Contact");
  const tCommon = useTranslations("Common");
  const lines = t.raw("titleLines") as string[];

  const channels = [
    {
      label: t("channels.telegram"),
      value: siteConfig.contacts.telegramHandle,
      href: siteConfig.contacts.telegram,
      external: true,
    },
    {
      label: t("channels.instagram"),
      value: siteConfig.contacts.instagramHandle,
      href: siteConfig.contacts.instagram,
      external: true,
    },
    {
      label: t("channels.email"),
      value: siteConfig.contacts.email,
      href: siteConfig.contacts.emailHref,
      external: false,
    },
    {
      label: t("channels.phone"),
      value: siteConfig.contacts.phone,
      href: siteConfig.contacts.phoneHref,
      external: false,
    },
  ];

  return (
    <Section
      id="contact"
      tone="ink"
      rule={false}
      className="relative isolate overflow-hidden"
    >
      <GlassBackdrop />
      <Container>
        <div className="grid gap-6 md:grid-cols-12">
          <div className="md:col-span-3">
            <Reveal from="left">
              <span className="label text-ink-muted">{t("label")}</span>
            </Reveal>
          </div>
          <div className="md:col-span-9">
            <h2 className="display-1 text-balance">
              <AnimatedText lines={lines} trigger="inView" />
            </h2>
            <Reveal from="right" delay={0.12}>
              <p className="lead mt-7 max-w-xl text-pretty text-ink-muted">
                {t("subtitle")}
              </p>
            </Reveal>
          </div>
        </div>

        <div className="mt-12 grid gap-12 md:grid-cols-12 md:gap-8 lg:mt-14">
          <div className="md:col-span-7">
            <Reveal from="left">
              <h3 className="label mb-8 text-ink-muted">{t("form.title")}</h3>
              <ContactForm tone="ink" />
            </Reveal>
          </div>

          <div className="md:col-span-4 md:col-start-9">
            <Reveal from="right" delay={0.08}>
              <h3 className="label text-ink-muted">{t("channels.title")}</h3>
              <ul className="mt-6 border-t border-ink-line">
                {channels.map(({ label, value, href, external }) => (
                  <li key={label} className="border-b border-ink-line">
                    <a
                      href={href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="group flex items-baseline justify-between gap-4 py-4"
                    >
                      <span className="text-sm text-ink-muted">{label}</span>
                      <span className="inline-flex items-center gap-1.5 text-[1.0625rem] transition-colors group-hover:text-primary">
                        {value}
                        {external ? (
                          <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        ) : null}
                      </span>
                    </a>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 border-b border-ink-line py-4">
                  <span className="text-sm text-ink-muted">
                    {t("channels.location")}
                  </span>
                  <span className="text-[1.0625rem]">
                    {tCommon("location")}
                  </span>
                </li>
              </ul>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
