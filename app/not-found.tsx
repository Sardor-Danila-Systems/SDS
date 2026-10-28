import Link from "next/link";
import { headers } from "next/headers";
import { Onest } from "next/font/google";
import { ArrowRight } from "lucide-react";
import ru from "../messages/ru.json";
import en from "../messages/en.json";
import uz from "../messages/uz.json";
import {
  NOT_FOUND_LINK_CLASS,
  NotFoundView,
} from "@/components/layout/not-found-view";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

const COPY = { ru: ru.NotFound, en: en.NotFound, uz: uz.NotFound } as const;
type Lang = keyof typeof COPY;

/** The visitor's language from the browser, with Russian as the site's default. */
function pickLanguage(acceptLanguage: string | null): Lang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code === "en" || code === "uz" || code === "ru") return code;
  }
  return "ru";
}

/**
 * The fallback for a path that matches no page at all — it never reaches the
 * locale layout, so this renders its own document, and with no header or
 * provider it picks the language itself.
 */
export default async function GlobalNotFound() {
  const lang = pickLanguage((await headers()).get("accept-language"));
  const t = COPY[lang];

  return (
    <html lang={lang} className={onest.variable}>
      <body className="min-h-dvh bg-ink font-sans antialiased">
        <NotFoundView
          title={t.title}
          subtitle={t.subtitle}
          action={
            <Link href={lang === "ru" ? "/" : `/${lang}`} className={NOT_FOUND_LINK_CLASS}>
              {t.cta}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          }
        />
      </body>
    </html>
  );
}
