"use client";

import { useTransition } from "react";
import { assignTaskOwnerAction } from "@/app/admin/crm/actions";

/** Admin-only: hand a task to someone else. The server re-checks the right. */
export function AssigneeSelect({
  taskId,
  ownerId,
  people,
}: {
  taskId: string;
  ownerId?: string;
  people: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Исполнитель"
      value={ownerId ?? ""}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          await assignTaskOwnerAction(taskId, next);
        });
      }}
      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-60"
    >
      {ownerId && !people.some((p) => p.id === ownerId) ? (
        <option value={ownerId}>—</option>
      ) : null}
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}
