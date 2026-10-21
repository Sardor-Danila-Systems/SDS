import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PriorityTag, formatDate } from "@/components/crm/ui";
import { cn } from "@/lib/utils";
import {
  DEPARTMENT_LABEL,
  departmentOf,
  initials,
  isOverdue,
  taskKey,
  type TaskView,
} from "./shared";

/** The card used on every board: key, title, due date, department and assignee. */
export function TaskCard({
  task,
  compact = false,
}: {
  task: TaskView;
  /** In a person's lane the assignee and department are already known. */
  compact?: boolean;
}) {
  return (
    <Link href={`/admin/tracker/${task.id}`} className="block" draggable={false}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">{taskKey(task.number)}</span>
        <PriorityTag priority={task.priority} />
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{task.title}</p>
      {task.projectName ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{task.projectName}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            isOverdue(task) ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {task.dueAt ? (
            <>
              <CalendarClock className="size-3.5" />
              {formatDate(task.dueAt)}
            </>
          ) : null}
        </span>
        {compact ? null : (
          <span className="flex items-center gap-1.5">
            <span className="rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
              {DEPARTMENT_LABEL[departmentOf(task.ownerRole)]}
            </span>
            <span
              title={task.ownerName}
              className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-[0.625rem] font-semibold text-primary"
            >
              {initials(task.ownerName)}
            </span>
          </span>
        )}
      </div>
    </Link>
  );
}
