"use client";

import { useState, useTransition } from "react";
import { moveTaskAction } from "@/app/admin/crm/actions";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/crm";
import { TaskCard } from "./task-card";
import {
  BOARD_COLUMNS,
  DEPARTMENT_LABEL,
  departmentOf,
  initials,
  isOverdue,
  type TaskView,
} from "./shared";
import type { Person } from "./stats";

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/**
 * A board with one lane per person. Drag a card into another status to move
 * it; drag it into another person's lane to hand the task over. The change
 * shows at once and is rolled back if the server refuses.
 */
export function LaneBoard({ tasks, lanes }: { tasks: TaskView[]; lanes: Person[] }) {
  const [items, setItems] = useState(tasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [seen, setSeen] = useState(tasks);
  if (seen !== tasks) {
    setSeen(tasks);
    setItems(tasks);
  }

  function drop(lane: Person, status: TaskStatus) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const task = items.find((t) => t.id === id);
    if (!task || (task.status === status && task.ownerId === lane.id)) return;

    const previous = items;
    const reassigned = task.ownerId !== lane.id;
    setError(null);
    setItems((rows) =>
      rows.map((t) =>
        t.id === id
          ? { ...t, status, ownerId: lane.id, ownerName: lane.name, ownerRole: lane.role }
          : t,
      ),
    );
    startTransition(async () => {
      const result = await moveTaskAction(id, status, reassigned ? lane.id : undefined);
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="min-w-[56rem] space-y-4">
          <div className="grid grid-cols-4 gap-3 pl-0">
            {BOARD_COLUMNS.map((c) => (
              <h3 key={c.status} className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span className={cn("size-2 rounded-full", c.dot)} />
                {c.label}
              </h3>
            ))}
          </div>

          {lanes.map((lane) => {
            const mine = items.filter((t) => t.ownerId === lane.id);
            const doneCount = mine.filter((t) => t.status === "DONE").length;
            const openCount = mine.length - doneCount;
            const overdue = mine.filter(isOverdue).length;
            const share = mine.length ? Math.round((doneCount / mine.length) * 100) : 0;
            return (
              <section key={lane.id} className="admin-panel overflow-hidden">
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {initials(lane.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{lane.name}</p>
                    <p className="text-xs text-muted-foreground">{DEPARTMENT_LABEL[departmentOf(lane.role)]}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-4 text-xs tabular text-muted-foreground">
                    <span>{openCount} открыто</span>
                    {overdue > 0 ? <span className="font-medium text-destructive">{overdue} просрочено</span> : null}
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-[var(--success)]" style={{ width: `${share}%` }} />
                      </span>
                      {share}%
                    </span>
                  </div>
                </header>

                <div className="grid grid-cols-4 gap-3 p-3">
                  {BOARD_COLUMNS.map((column) => {
                    const cell = `${lane.id}:${column.status}`;
                    const rows = mine
                      .filter((t) => t.status === column.status)
                      .sort(
                        (a, b) =>
                          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
                          (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"),
                      );
                    return (
                      <div
                        key={column.status}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setOver(cell);
                        }}
                        onDragLeave={() => setOver((c) => (c === cell ? null : c))}
                        onDrop={() => drop(lane, column.status)}
                        className={cn(
                          "min-h-24 space-y-2 rounded-lg border border-dashed p-2 transition-colors",
                          over === cell ? "border-primary bg-primary-soft" : "border-transparent bg-surface/60",
                        )}
                      >
                        {rows.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={() => setDragging(task.id)}
                            onDragEnd={() => {
                              setDragging(null);
                              setOver(null);
                            }}
                            className={cn(
                              "cursor-grab rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong active:cursor-grabbing",
                              dragging === task.id && "opacity-40",
                            )}
                          >
                            <TaskCard task={task} compact />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
