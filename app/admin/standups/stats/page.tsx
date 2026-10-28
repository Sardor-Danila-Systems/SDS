import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock, UserCheck, UserX, Users, Video } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import { attendanceStats } from "@/lib/crm/standups";
import { PageHeader, Panel, Stat } from "@/components/crm/ui";
import { formatMonth, initials } from "@/components/standups/shared";
import { cn } from "@/lib/utils";

const PERIODS = [7, 30, 90] as const;

export default async function StandupStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "standup.manage")) redirect("/admin");

  const { days: daysParam } = await searchParams;
  const days = PERIODS.find((p) => String(p) === daysParam) ?? 30;

  let stats;
  try {
    stats = await attendanceStats(days);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const absences = stats.people.reduce((n, p) => n + p.absent + p.excused, 0);
  const lates = stats.people.reduce((n, p) => n + p.late, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/standups"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К созвонам
      </Link>
      <PageHeader title="Статистика посещаемости" hint="Считаются созвоны, где кто-то отмечен и которые не отменены" />

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {PERIODS.map((n) => (
          <Link
            key={n}
            href={n === 30 ? "/admin/standups/stats" : `/admin/standups/stats?days=${n}`}
            className={cn(
              "inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors",
              n === days ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {n} дней
          </Link>
        ))}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Video} value={String(stats.calls)} label="Созвонов за период" />
        <Stat
          icon={Users}
          tone="accent"
          value={stats.teamPercent === null ? "—" : `${stats.teamPercent}%`}
          label="Посещаемость команды"
        />
        <Stat icon={UserX} tone={absences ? "warn" : "default"} value={String(absences)} label="Пропусков" />
        <Stat icon={Clock} value={String(lates)} label="Опозданий" />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel title="Посещаемость по участникам" flush>
          {stats.people.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">За период нет отмеченных созвонов.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.people.map((p) => (
                <li key={p.userId} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {initials(p.name)}
                    </span>
                    <Link
                      href={`/admin/standups/people/${p.userId}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
                    >
                      {p.name}
                    </Link>
                    <span className="text-lg font-semibold tabular">{p.percent === null ? "—" : `${p.percent}%`}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full", (p.percent ?? 0) >= 80 ? "bg-[var(--success)]" : "bg-[var(--warning)]")}
                      style={{ width: `${p.percent ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 text-xs tabular text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="size-3.5" /> был {p.attended} из {p.marked}
                    </span>
                    <span>опозданий {p.late}</span>
                    <span className={p.absent ? "font-medium text-destructive" : ""}>пропусков {p.absent}</span>
                    <span>предупредил / уважительно {p.excused}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Динамика по месяцам">
          <ul className="space-y-3">
            {stats.months.map((m) => (
              <li key={m.month}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{formatMonth(m.month)}</span>
                  <span className="tabular text-muted-foreground">
                    {m.percent === null ? "нет данных" : `${m.percent}%`} · {m.calls} созв.
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${m.percent ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
