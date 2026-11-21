import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { locales } from "./i18n/routing";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Non-default locales are served under a prefix, so old links have to be
// redirected for each of them as well as for the bare path.
const prefixes = ["", ...locales.map((locale) => `/${locale}`)];

const legacyPaths: { from: string; to: string }[] = [
  // The CMS moved under /admin/content when the CRM was added.
  { from: "/admin/projects", to: "/admin/content" },
  { from: "/admin/projects/new", to: "/admin/content/projects/new" },
  { from: "/admin/projects/:slug/edit", to: "/admin/content/projects/:slug/edit" },
  // Case studies kept their own routes through the rework.
  { from: "/portfolio/:slug", to: "/projects/:slug" },
  // Oson Uy ships as one product with three surfaces; the old satellite
  // slugs fold into the parent case study.
  { from: "/projects/oson-uy-mobile", to: "/projects/oson-uy" },
  { from: "/projects/oson-uy-crm", to: "/projects/oson-uy" },
  // Everything else is now a section of the one-page site. `/projects` is an
  // exact match, so it never shadows `/projects/:slug`.
  { from: "/portfolio", to: "/#projects" },
  { from: "/projects", to: "/#projects" },
  { from: "/about", to: "/#about" },
  { from: "/contact", to: "/#contact" },
  { from: "/services", to: "/#about" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Multiple lockfiles exist in the monorepo root; pin tracing to this app.
  outputFileTracingRoot: path.join(__dirname),
  images: {
    formats: ["image/avif", "image/webp"],
    // Pictures uploaded through /admin are served from /api/media (Neon). The
    // Blob host stays allowed only for old links not yet moved by the import.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async redirects() {
    return prefixes.flatMap((prefix) =>
      legacyPaths.map(({ from, to }) => ({
        source: `${prefix}${from}`,
        destination: `${prefix}${to}`,
        permanent: true,
      })),
    );
  },
};

export default withNextIntl(nextConfig);
