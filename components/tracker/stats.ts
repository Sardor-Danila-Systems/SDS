import { departmentOf, isOverdue, type TaskView } from "./shared";
import type { Role } from "@/types/crm";

export interface Person {
  id: string;
  name: string;
  role: Role;
}

export interface PersonStats extends Person {
  done: number;
  open: number;
  overdue: number;
  /** Share of finished tasks with a due date that were finished by it; null when none had one. */
  onTimePct: number | null;
}

export interface DayBucket {
  date: string;
  sales: number;
  dev: number;
  other: number;
}

export interface ControlStats {
  doneInPeriod: number;
  open: number;
  inReview: number;
  overdue: number;
  onTimePct: number | null;
  avgDays: number | null;
  byDay: DayBucket[];
  people: PersonStats[];
  recentDone: TaskView[];
}

const DAY = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10);

/** When a task was finished. Tasks closed before completion was recorded fall back to the last change. */
export const finishedAt = (task: TaskView) => task.completedAt ?? task.updatedAt;

/**
 * Everything the control page shows, computed from plain task data. Pure and
 * synchronous, so it behaves the same on every render and is easy to reason
 * about: a task counts as "done in the period" by when it was finished, not
 * when it was created.
 */
export function computeStats(
  tasks: TaskView[],
  people: Person[],
  days: number,
  now = new Date(),
): ControlStats {
  const live = tasks.filter((t) => t.status !== "CANCELLED");
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const done = live.filter((t) => t.status === "DONE" && finishedAt(t) >= since);
  const open = live.filter((t) => t.status !== "DONE");

  const onTime = (rows: TaskView[]) => {
    const dated = rows.filter((t) => t.dueAt);
    if (dated.length === 0) return null;
    const good = dated.filter((t) => dayKey(finishedAt(t)) <= dayKey(t.dueAt!)).length;
    return Math.round((good / dated.length) * 100);
  };

  const cycle = done.map((t) => (Date.parse(finishedAt(t)) - Date.parse(t.createdAt)) / DAY);
  const avgDays = cycle.length
    ? Math.round((cycle.reduce((a, b) => a + b, 0) / cycle.length) * 10) / 10
    : null;

  const byDay: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    byDay.push({ date, sales: 0, dev: 0, other: 0 });
  }
  for (const task of done) {
    const bucket = byDay.find((b) => b.date === dayKey(finishedAt(task)));
    if (!bucket) continue;
    const dept = departmentOf(task.ownerRole);
    if (dept === "SALES") bucket.sales++;
    else if (dept === "DEV") bucket.dev++;
    else bucket.other++;
  }

  const stats: PersonStats[] = people.map((person) => {
    const mine = live.filter((t) => t.ownerId === person.id);
    const mineDone = mine.filter((t) => t.status === "DONE" && finishedAt(t) >= since);
    const mineOpen = mine.filter((t) => t.status !== "DONE");
    return {
      ...person,
      done: mineDone.length,
      open: mineOpen.length,
      overdue: mineOpen.filter(isOverdue).length,
      onTimePct: onTime(mineDone),
    };
  });
  stats.sort((a, b) => b.done - a.done || a.overdue - b.overdue || a.name.localeCompare(b.name));

  return {
    doneInPeriod: done.length,
    open: open.length,
    inReview: open.filter((t) => t.status === "REVIEW").length,
    overdue: open.filter(isOverdue).length,
    onTimePct: onTime(done),
    avgDays,
    byDay,
    people: stats,
    recentDone: [...done].sort((a, b) => finishedAt(b).localeCompare(finishedAt(a))).slice(0, 12),
  };
}
