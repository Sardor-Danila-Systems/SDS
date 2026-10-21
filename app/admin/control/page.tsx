import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlarmClock,
  CheckCircle2,
  Clock3,
  ListChecks,
  Timer,
  Trophy,
} from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, listProjects, listTasks } from "@/lib/crm/repo";
import { PageHeader, Panel, Stat, formatDate } from "@/components/crm/ui";
import { DoneChart } from "@/components/tracker/done-chart";
import { LaneBoard } from "@/components/tracker/lane-board";
import {
  DEPARTMENT_LABEL,
  departmentOf,
  initials,
  taskKey,
  type Department,
  type TaskView,
} from "@/components/tracker/shared";
import { computeStats, finishedAt, type Person } from "@/components/tracker/stats";
import { cn } from "@/lib/utils";

const DEPTS: { key: "" | Department; label: string }[] = [
  { key: "", label: "Все" },
  { key: "SALES", label: "Продажи" },
  { key: "DEV", label: "Разработка" },
];
const PERIODS = [7, 30] as const;

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "team.view")) redirect("/admin");

  const { dept: deptParam, days: daysParam } = await searchParams;
  const dept = deptParam === "SALES" || deptParam === "DEV" ? deptParam : "";
  const days = daysParam === "30" ? 30 : 7;

  let allTasks, projects;
  try {
    [allTasks, projects] = await Promise.all([listTasks(), listProjects()]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const everyone = await listAssignableUsers();

  const views: TaskView[] = allTasks.map((task) => {
    const person = everyone.find((p) => p.id === task.ownerId);
    return {
      id: task.id,
      number: task.number ?? 0,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      ownerId: task.ownerId,
      ownerName: person?.name ?? "Не назначен",
      ownerRole: person?.role,
      projectName: projects.find((p) => p.id === task.projectId)?.name,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  });

  const inDept = (role?: Person["role"]) => !dept || departmentOf(role) === dept;
  const tasks = views.filter((t) => inDept(t.ownerRole));
  const people: Person[] = everyone
    .filter((p) => inDept(p.role) && (dept !== "" || p.id !== "bootstrap-admin" || tasks.some((t) => t.ownerId === p.id)))
    .map((p) => ({ id: p.id, name: p.name, role: p.role }));

  const stats = computeStats(tasks, people, days);

  // The board shows everything open plus what was finished in the period.
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const boardTasks = tasks.filter(
    (t) => t.status !== "CANCELLED" && (t.status !== "DONE" || finishedAt(t) >= since),
  );
  const lanes: Person[] = [...people];
  for (const task of boardTasks) {
    if (task.ownerId && !lanes.some((l) => l.id === task.ownerId)) {
      lanes.push({ id: task.ownerId, name: task.ownerName, role: task.ownerRole ?? "ADMIN" });
    }
  }

  const href = (next: { dept?: string; days?: number }) => {
    const params = new URLSearchParams();
    const d = next.dept ?? dept;
    const n = next.days ?? days;
    if (d) params.set("dept", d);
    if (n !== 7) params.set("days", String(n));
    const qs = params.toString();
    return `/admin/control${qs ? `?${qs}` : ""}`;
  };

  const topDone = Math.max(1, ...stats.people.map((p) => p.done));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Контроль работы"
        hint="Что делают отдел продаж и разработка: сделано, в работе, просрочено"
        action={
          <Link
            href="/admin/tracker/new"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-panel)] transition-colors hover:bg-primary-hover"
          >
            Новая задача
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {DEPTS.map((d) => (
            <Link
              key={d.key}
              href={href({ dept: d.key })}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors",
                d.key === dept ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {PERIODS.map((n) => (
            <Link
              key={n}
              href={href({ days: n })}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors",
                n === days ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {n} дней
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={CheckCircle2} tone="accent" value={String(stats.doneInPeriod)} label={`Выполнено за ${days} дн.`} />
        <Stat icon={ListChecks} value={String(stats.open)} label="Открыто сейчас" />
        <Stat icon={Clock3} value={String(stats.inReview)} label="На проверке" />
        <Stat
          icon={AlarmClock}
          tone={stats.overdue ? "warn" : "default"}
          value={String(stats.overdue)}
          label="Просрочено"
        />
        <Stat
          icon={Timer}
          value={stats.onTimePct === null ? "—" : `${stats.onTimePct}%`}
          label={stats.avgDays === null ? "Сдано в срок" : `Сдано в срок · в среднем ${stats.avgDays} дн.`}
        />
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel title="Выполнено по дням">
          <DoneChart days={stats.byDay} />
        </Panel>

        <Panel title="Кто сколько сделал" description={`За ${days} дн.`} flush>
          {stats.people.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">В этом отделе пока никого нет.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.people.map((p, index) => (
                <li key={p.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {p.name}
                        {index === 0 && p.done > 0 ? <Trophy className="size-3.5 text-[var(--warning)]" aria-label="Лидер периода" /> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{DEPARTMENT_LABEL[departmentOf(p.role)]}</p>
                    </div>
                    <span className="text-lg font-semibold tabular">{p.done}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(p.done / topDone) * 100}%` }} />
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 text-xs tabular text-muted-foreground">
                    <span>{p.open} открыто</span>
                    <span className={p.overdue ? "font-medium text-destructive" : ""}>{p.overdue} просрочено</span>
                    <span>{p.onTimePct === null ? "в срок: —" : `в срок: ${p.onTimePct}%`}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <Panel
        title="Доска по сотрудникам"
        description="Перетащите карточку в другую колонку, чтобы сменить статус, или на дорожку другого человека, чтобы передать задачу"
        flush
      >
        <div className="p-4">
          {lanes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Пока нет сотрудников. Создайте аккаунты на странице «Команда».</p>
          ) : (
            <LaneBoard tasks={boardTasks} lanes={lanes} />
          )}
        </div>
      </Panel>

      <Panel title="Недавно выполнено" flush>
        {stats.recentDone.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">За выбранный период ничего не закрыто.</p>
        ) : (
          <ul className="divide-y divide-border">
            {stats.recentDone.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/admin/tracker/${task.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 transition-colors hover:bg-surface/60"
                >
                  <span className="min-w-0 text-sm">
                    <span className="mr-2 text-xs tabular text-muted-foreground">{taskKey(task.number)}</span>
                    <span className="font-medium">{task.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {task.ownerName} · {DEPARTMENT_LABEL[departmentOf(task.ownerRole)]} · {formatDate(finishedAt(task))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
