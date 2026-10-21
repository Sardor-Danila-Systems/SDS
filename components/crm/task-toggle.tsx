"use client";

import { useTransition } from "react";
import { setTaskStatusAction } from "@/app/admin/crm/actions";
import type { TaskStatus } from "@/types/crm";
import { cn } from "@/lib/utils";

/** Completing a task is one click; the repository logs it against the lead. */
export function TaskToggle({
    taskId,
    status,
}: {
    taskId: string;
    status: TaskStatus;
}) {
    const [pending, startTransition] = useTransition();
    const done = status === "DONE";

    return (
        <button
            type="button"
            disabled={pending}
            aria-pressed={done}
            aria-label={done ? "Вернуть в работу" : "Отметить выполненной"}
            onClick={() =>
                startTransition(async () => {
                    await setTaskStatusAction(taskId, done ? "TODO" : "DONE");
                })
            }
            className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs transition-colors",
                done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong hover:border-primary",
                pending && "opacity-60",
            )}
        >
            {done ? "✓" : ""}
        </button>
    );
}
