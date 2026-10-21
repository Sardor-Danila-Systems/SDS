import Link from "next/link";
import { Onest, JetBrains_Mono } from "next/font/google";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { GlobalSearch } from "@/components/crm/global-search";
import { Notifications } from "@/components/crm/notifications";
import { listNotifications } from "@/lib/crm/repo";
import { ArrowUpRight } from "lucide-react";
import { THEME_INIT_SCRIPT } from "@/components/admin/theme-toggle";
import "../globals.css";
import "./admin.css";

/**
 * The admin panel sits outside `[locale]`, so it owns its own document — the
 * root layout is a pass-through and cannot render `<html>` for both branches
 * without nesting two documents.
 *
 * It uses the same type and tokens as the public site, so working on the
 * content looks like the thing being worked on.
 */

const onest = Onest({
    subsets: ["latin", "cyrillic"],
    variable: "--font-onest",
    display: "swap",
});

const mono = JetBrains_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--font-mono-jb",
    display: "swap",
});

export const metadata = {
    title: "SDS — админка",
    robots: { index: false, follow: false },
};

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Null on the login page, which renders without the shell.
    const user = await getSessionUser();
    // Derived from the records, so the bell can't disagree with the data.
    const notifications = user ? await listNotifications() : [];

    return (
        <html
            lang="ru"
            data-admin=""
            suppressHydrationWarning
            className={`${onest.variable} ${mono.variable}`}
        >
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
                {user ? (
                    <div className="lg:flex">
                        <AdminNav
                            role={user.role}
                            userName={user.name}
                            mobileActions={<Notifications items={notifications} />}
                        />
                        <div className="min-w-0 flex-1">
                            <header className="sticky top-0 z-30 hidden h-14 items-center justify-end gap-3 border-b border-border bg-background/80 px-8 backdrop-blur-xl lg:flex">
                                <GlobalSearch />
                                <Notifications items={notifications} />
                                <Link
                                    href="/"
                                    target="_blank"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:text-foreground"
                                >
                                    Сайт <ArrowUpRight className="size-3.5" />
                                </Link>
                            </header>
                            <main className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                                {children}
                            </main>
                        </div>
                    </div>
                ) : (
                    <main>{children}</main>
                )}
            </body>
        </html>
    );
}
