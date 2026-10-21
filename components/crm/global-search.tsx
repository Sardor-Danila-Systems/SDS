"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { SearchHit } from "@/lib/crm/repo";

/**
 * One box across the whole CRM. Debounced, closes on route change, and never
 * blocks the header — an empty or failing search simply shows nothing.
 */
export function GlobalSearch() {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    useEffect(() => {
        setOpen(false);
        setQuery("");
    }, [pathname]);

    useEffect(() => {
        if (query.trim().length < 2) {
            setHits([]);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                const data = await res.json();
                setHits(data.hits ?? []);
                setOpen(true);
            } catch {
                /* aborted or offline — leave the previous result alone */
            }
        }, 220);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!box.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    return (
        <div ref={box} className="relative hidden w-72 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => hits.length && setOpen(true)}
                placeholder="Поиск по CRM"
                aria-label="Поиск по CRM"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm shadow-[var(--shadow-panel)] transition-colors placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-none"
            />

            {open && hits.length > 0 ? (
                <ul className="absolute right-0 top-11 z-50 max-h-96 w-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-[var(--shadow-pop)]">
                    {hits.map((hit) => (
                        <li key={`${hit.kind}-${hit.id}`}>
                            <Link
                                href={hit.href}
                                onClick={() => setOpen(false)}
                                className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm">{hit.title}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {hit.subtitle}
                                    </span>
                                </span>
                                <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] text-muted-foreground">{hit.kind}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}

            {open && query.trim().length >= 2 && hits.length === 0 ? (
                <p className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-[var(--shadow-pop)]">
                    Ничего не найдено
                </p>
            ) : null}
        </div>
    );
}
