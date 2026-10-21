"use client";

import { useState, useTransition } from "react";
import { setTaskStatusAction } from "@/app/admin/crm/actions";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/crm";
import { TaskCard } from "./task-card";
import { BOARD_COLUMNS, type TaskView } from "./shared";

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/**
 * The kanban board. Dragging a card sets its status; the change shows at once
 * and is rolled back if the server refuses it (someone else's task, say).
 */
export function TaskBoard({ tasks }: { tasks: TaskView[] }) {
  const [items, setItems] = useState(tasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // A fresh server render (filters, saves elsewhere) replaces local state.
  const [seen, setSeen] = useState(tasks);
  if (seen !== tasks) {
    setSeen(tasks);
    setItems(tasks);
  }

  function drop(status: TaskStatus) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const task = items.find((t) => t.id === id);
    if (!task || task.status === status) return;

    const previous = items;
    setError(null);
    setItems((rows) => rows.map((t) => (t.id === id ? { ...t, status } : t)));
    startTransition(async () => {
      const result = await setTaskStatusAction(id, status);
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
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid min-w-max grid-flow-col auto-cols-[19rem] gap-4 xl:min-w-0 xl:auto-cols-fr">
          {BOARD_COLUMNS.map((column) => {
            const rows = items
              .filter((t) => t.status === column.status)
              .sort(
                (a, b) =>
                  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
                  (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"),
              );
            return (
              <section
                key={column.status}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column.status);
                }}
                onDragLeave={() => setOver((s) => (s === column.status ? null : s))}
                onDrop={() => drop(column.status)}
                className={cn(
                  "flex min-h-64 flex-col rounded-xl border p-3 transition-colors",
                  over === column.status
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface/60",
                )}
              >
                <header className="flex items-center justify-between px-1 pb-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", column.dot)} />
                    {column.label}
                  </h2>
                  <span className="rounded-full bg-card px-2 py-0.5 text-xs tabular text-muted-foreground">
                    {rows.length}
                  </span>
                </header>

                <ul className="flex-1 space-y-2">
                  {rows.map((task) => (
                    <li key={task.id}>
                      <div
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
                        <TaskCard task={task} />
                      </div>
                    </li>
                  ))}
                  {rows.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-xs text-subtle-foreground">
                      Перетащите задачу сюда
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
