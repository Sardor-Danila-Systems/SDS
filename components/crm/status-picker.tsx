"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/admin/crm/actions";

/**
 * A row of statuses where clicking one applies it. Used for proposals and
 * client projects — the same interaction as the lead stage picker.
 */
export function StatusPicker<T extends string>({
    value,
    options,
    labels,
    onPick,
}: {
    value: T;
    options: readonly T[];
    labels?: Record<string, string>;
    onPick: (next: T) => Promise<ActionResult>;
}) {
    const [pending, startTransition] = useTransition();

    return (
        <div className={cn("flex flex-wrap gap-1.5", pending && "opacity-60")}>
            {options.map((option) => {
                const active = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        disabled={pending || active}
                        onClick={() => startTransition(async () => { await onPick(option); })}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            active
                                ? "border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-panel)]"
                                : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
                        )}
                    >
                        {labels?.[option] ?? option}
                    </button>
                );
            })}
        </div>
    );
}
