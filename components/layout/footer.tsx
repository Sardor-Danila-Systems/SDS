"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import HalftoneWordmarkFooter, {
  type FooterColumn,
} from "@/components/ui/halftone-wordmark-footer";
import { navSections } from "@/data/navigation";
import { siteConfig } from "@/lib/site";
import { scrollToSection } from "@/lib/scroll";

/**
 * The closing footer: the word "sds" set enormous in halftone dots and cropped
 * by the bottom edge, with the section links, channels and legal line above it.
 * The dots part around the pointer and a click sends a ring through the word.
 */

// Canvas text can't use a CSS variable, so the site's own faces are read from
// the variables `next/font` defines on <html> once the page is up.
function readFace(variable: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || undefined;
}

export function Footer() {
  const t = useTranslations("Footer");
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const year = new Date().getFullYear();

  const [faces, setFaces] = useState<{ sans?: string; mono?: string }>({});
  const [gap, setGap] = useState(6);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setFaces({ sans: readFace("--font-onest"), mono: readFace("--font-mono-jb") });
    const size = () => {
      setGap(window.innerWidth < 640 ? 4 : window.innerWidth < 1280 ? 6 : 7);
      setNarrow(window.innerWidth <= 720);
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  const columns: FooterColumn[] = [
    {
      title: t("sections"),
      links: navSections.map((section) => ({
        label: tNav(section.key),
        href: `/#${section.id}`,
        onClick: (event) => {
          // On the home page glide there; elsewhere let the link take us home.
          if (document.getElementById(section.id)) {
            event.preventDefault();
            scrollToSection(section.id);
          }
        },
      })),
    },
    {
      title: t("social"),
      links: [
        { label: "Telegram", href: siteConfig.contacts.telegram, external: true },
        { label: "Instagram", href: siteConfig.contacts.instagram, external: true },
      ],
    },
    {
      title: t("contacts"),
      links: [
        { label: siteConfig.contacts.email, href: siteConfig.contacts.emailHref },
        { label: siteConfig.contacts.phone, href: siteConfig.contacts.phoneHref },
      ],
    },
  ];

  return (
    <HalftoneWordmarkFooter
      wordmark="sds"
      label={`${siteConfig.name} · ${tCommon("location")}`}
      meta={`© ${year} · ${t("rights")}`}
      columns={columns}
      backToTopLabel={t("backToTop")}
      palette={{ background: "#0b0b0c", ink: "#f7f7f5", warm: "#4b8bff" }}
      fontFamily={faces.sans}
      monoFamily={faces.mono}
      fontWeight={800}
      dotGap={gap}
      radius={90}
      crop={0.18}
      // The word is ~0.4 of the width tall; the link block above it needs
      // more room once the columns wrap on a phone.
      height={narrow ? "calc(40vw + 310px)" : "calc(40vw + 240px)"}
    />
  );
}
