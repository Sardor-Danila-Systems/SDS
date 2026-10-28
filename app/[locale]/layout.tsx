import type { Metadata } from "next";
import { Onest, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { siteConfig } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { Header } from "@/components/navigation/header";
import { Footer } from "@/components/layout/footer";
import { SmoothScroll } from "@/components/animations/smooth-scroll";
import { Preloader } from "@/components/layout/preloader";
import { PRELOADER_GUARD } from "@/components/layout/preloader-shared";
import { OrganizationSchema } from "@/components/structured-data";
import "../globals.css";

// A contemporary grotesk with a proper Cyrillic cut — the typography does most
// of the design work here, so the face matters more than anything else.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

// Reserved for numerals: indices, step counters, table figures.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-jb",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta.home" });

  return {
    metadataBase: new URL(siteConfig.url),
    applicationName: siteConfig.shortName,
    ...buildMetadata({
      locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
      path: "/",
      title: t("title"),
      description: t("description"),
    }),
    title: {
      default: `${siteConfig.shortName} — ${t("title")}`,
      template: `%s — ${siteConfig.shortName}`,
    },
    icons: { icon: "/logo.png" },
    // Ownership proof for Google Search Console. Rendered as
    // <meta name="google-site-verification" content="..."> on every page,
    // including the unprefixed homepage Google checks.
    verification: { google: "TBF1fVjs6-bsAsaIw-Oy_oFFdnopP74YVqgLdyofNaQ" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Nav" });

  return (
    <html
      lang={locale}
      className={`${onest.variable} ${mono.variable}`}
      // The guard below may add a class to <html> before React sees it.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRELOADER_GUARD }} />
        {/* Without JavaScript the opening could never end — never show it. */}
        <noscript>
          <style>{".sds-preloader{display:none}"}</style>
        </noscript>
      </head>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <Preloader />
        <OrganizationSchema />
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-100 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
          >
            {t("skip")}
          </a>
          <SmoothScroll />
          <Header />
          <main id="main">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
