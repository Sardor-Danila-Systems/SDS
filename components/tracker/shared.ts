import type { Priority, Role, TaskStatus } from "@/types/crm";

/** A task as the tracker screens need it — plain data, safe to pass to the client. */
export interface TaskView {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueAt?: string;
  ownerId?: string;
  ownerName: string;
  ownerRole?: Role;
  projectName?: string;
}

export type Department = "SALES" | "DEV" | "ADMIN";

/** The department is the assignee's role — there is no separate field to keep in sync. */
export function departmentOf(role?: Role): Department {
  if (role === "SALES") return "SALES";
  if (role === "DEVELOPER") return "DEV";
  return "ADMIN";
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  SALES: "Продажи",
  DEV: "Разработка",
  ADMIN: "Управление",
};

export const BOARD_COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: "TODO", label: "К выполнению", dot: "bg-subtle-foreground" },
  { status: "IN_PROGRESS", label: "В работе", dot: "bg-primary" },
  { status: "REVIEW", label: "На проверке", dot: "bg-[var(--warning)]" },
  { status: "DONE", label: "Готово", dot: "bg-[var(--success)]" },
];

export const taskKey = (number: number) => `SDS-${number}`;

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function isOverdue(task: Pick<TaskView, "dueAt" | "status">) {
  if (!task.dueAt || task.status === "DONE" || task.status === "CANCELLED") return false;
  return task.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
