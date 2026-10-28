"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  markAllPresentAction,
  removeGuestAction,
  setAttendanceAction,
} from "@/app/admin/standups/actions";
import { cn } from "@/lib/utils";
import {
  ABSENCE_REASONS,
  ATTENDANCE_STATUSES,
  type AbsenceReason,
  type Attendance,
  type AttendanceStatus,
} from "@/types/crm";
import {
  NEEDS_REASON,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  initials,
} from "./shared";

const CONTROL =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60";

/**
 * The attendance table. Each change is sent as soon as it is made and shown at
 * once; if the server refuses, the row goes back and says why.
 */
export function AttendanceTable({
  standupId,
  entries,
  editable,
}: {
  standupId: string;
  entries: Attendance[];
  editable: boolean;
}) {
  const [rows, setRows] = useState(entries);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A fresh render from the server (another change, a new guest) wins.
  const [seen, setSeen] = useState(entries);
  if (seen !== entries) {
    setSeen(entries);
    setRows(entries);
  }

  function save(
    entry: Attendance,
    next: { status: AttendanceStatus; reason?: AbsenceReason; reasonText?: string },
  ) {
    const previous = rows;
    setError(null);
    setRows((list) => list.map((r) => (r.id === entry.id ? { ...r, ...next } : r)));
    startTransition(async () => {
      const result = await setAttendanceAction(
        standupId,
        entry.id,
        next.status,
        next.reason ?? "",
        next.reasonText ?? "",
      );
      if (!result.ok) {
        setRows(previous);
        setError(result.error);
      }
    });
  }

  function markAll() {
    setError(null);
    startTransition(async () => {
      const result = await markAllPresentAction(standupId);
      if (!result.ok) setError(result.error);
    });
  }

  const unmarked = rows.filter((r) => r.status === "UNMARKED").length;
  const present = rows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm text-muted-foreground tabular">
          Пришло {present} из {rows.length}
          {unmarked > 0 ? ` · не отмечено ${unmarked}` : ""}
        </p>
        {editable ? (
          <button
            type="button"
            onClick={markAll}
            disabled={pending || unmarked === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-card px-3 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Check className="size-4 text-[var(--success)]" />
            Все присутствовали
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mx-5 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {rows.map((entry) => {
          const tone = STATUS_TONE[entry.status];
          const showReason = NEEDS_REASON.includes(entry.status);
          return (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {initials(entry.name)}
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium">{entry.name}</p>
                {entry.guest ? <p className="text-xs text-muted-foreground">Гость</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {editable ? (
                  <button
                    type="button"
                    title="Присутствовал"
                    aria-label={`${entry.name}: присутствовал`}
                    disabled={pending}
                    onClick={() => save(entry, { status: "PRESENT" })}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-lg border transition-colors",
                      entry.status === "PRESENT"
                        ? "border-transparent bg-[var(--success-soft)] text-[var(--success)]"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Check className="size-4" />
                  </button>
                ) : null}

                <span className="relative inline-flex items-center">
                  <span className={cn("pointer-events-none absolute left-3 size-2 rounded-full", tone.dot)} />
                  <select
                    aria-label={`Статус: ${entry.name}`}
                    value={entry.status}
                    disabled={!editable || pending}
                    onChange={(e) =>
                      save(entry, {
                        status: e.target.value as AttendanceStatus,
                        reason: entry.reason,
                        reasonText: entry.reasonText,
                      })
                    }
                    className={cn(CONTROL, "min-w-44 pl-7", tone.text)}
                  >
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </span>

                {entry.guest && editable ? (
                  <button
                    type="button"
                    aria-label={`Убрать гостя ${entry.name}`}
                    title="Убрать гостя"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeGuestAction(standupId, entry.id);
                        if (!result.ok) setError(result.error);
                      })
                    }
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>

              {showReason ? (
                <div className="flex w-full flex-wrap items-center gap-2 pl-12">
                  <select
                    aria-label={`Причина: ${entry.name}`}
                    value={entry.reason ?? ""}
                    disabled={!editable || pending}
                    onChange={(e) =>
                      save(entry, {
                        status: entry.status,
                        reason: (e.target.value || undefined) as AbsenceReason | undefined,
                        reasonText: entry.reasonText,
                      })
                    }
                    className={cn(CONTROL, "min-w-48")}
                  >
                    <option value="">Причина не указана</option>
                    {ABSENCE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Комментарий: ${entry.name}`}
                    defaultValue={entry.reasonText ?? ""}
                    disabled={!editable || pending}
                    placeholder="Свой вариант или пояснение"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value === (entry.reasonText ?? "")) return;
                      save(entry, { status: entry.status, reason: entry.reason, reasonText: value });
                    }}
                    className={cn(CONTROL, "min-w-56 flex-1")}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
