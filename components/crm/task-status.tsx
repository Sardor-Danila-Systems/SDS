"use client";

import { setTaskStatusAction } from "@/app/admin/crm/actions";
import type { TaskStatus } from "@/types/crm";
import { StatusPicker } from "./status-picker";

const OPTIONS = ["TODO", "IN_PROGRESS", "DONE"] as const;
const LABELS: Record<string, string> = {
  TODO: "К выполнению",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
};

export function TaskStatusPicker({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}) {
  // A cancelled task shows no active option — picking one brings it back.
  return (
    <StatusPicker
      value={status as (typeof OPTIONS)[number]}
      options={OPTIONS}
      labels={LABELS}
      onPick={(next) => setTaskStatusAction(taskId, next)}
    />
  );
}
