import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import { personHistory } from "@/lib/crm/standups";
import { PageHeader, Panel, Stat, TASK_STATUS_LABEL, formatDate } from "@/components/crm/ui";
import {
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatStandupDate,
} from "@/components/standups/shared";
import { taskKey } from "@/components/tracker/shared";
import { cn } from "@/lib/utils";

export default async function StandupPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "standup.manage")) redirect("/admin");
  const { id } = await params;

  const person = (await listAssignableUsers()).find((p) => p.id === id);
  if (!person) notFound();

  let history;
  try {
    history = await personHistory(id);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const percent = history.marked ? Math.round((history.attended / history.marked) * 100) : null;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/standups/stats"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К статистике
      </Link>
      <PageHeader title={person.name} hint="Посещаемость созвонов и задачи, которые на нём с созвонов" />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="accent" value={percent === null ? "—" : `${percent}%`} label="Посещаемость" />
        <Stat value={`${history.attended} из ${history.marked}`} label="Был на созвонах" />
        <Stat value={String(history.late)} label="Опозданий" />
        <Stat tone={history.absent ? "warn" : "default"} value={String(history.absent)} label="Пропусков" />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Созвоны" flush>
          {history.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Пока ни одного созвона.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.rows.map(({ standup, entry }) => (
                <li key={standup.id}>
                  <Link
                    href={`/admin/standups/${standup.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface/60"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{standup.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatStandupDate(standup.date)}, {standup.time}
                        {entry.reason ? ` · ${REASON_LABEL[entry.reason]}` : ""}
                        {entry.reasonText ? ` · ${entry.reasonText}` : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-xs font-medium", STATUS_TONE[entry.status].text)}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Задачи с созвонов" flush>
          {history.tasks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Задач с созвонов нет.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/admin/tracker/${task.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface/60"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">
                        <span className="mr-2 text-xs tabular text-muted-foreground">{taskKey(task.number ?? 0)}</span>
                        {task.title}
                      </span>
                      {task.dueAt ? (
                        <span className="text-xs text-muted-foreground">срок {formatDate(task.dueAt)}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{TASK_STATUS_LABEL[task.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
