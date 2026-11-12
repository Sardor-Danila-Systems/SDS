import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, GitCommitHorizontal, GitPullRequest, ListChecks, TriangleAlert, Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import { PERIODS, buildPerformance, type Period } from "@/lib/performance";
import { EmptyState, PageHeader, Panel, Stat, formatDate } from "@/components/crm/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "team.view")) redirect("/admin");

  const { days } = await searchParams;
  const period = (PERIODS.find((p) => String(p) === days) ?? 30) as Period;

  let data;
  try {
    data = await buildPerformance(period);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const peak = Math.max(1, ...data.daily.map((d) => d.commits));
  const broken = [
    !data.github.ok && { name: "GitHub", note: data.github.note },
    !data.jira.ok && { name: "Jira", note: data.jira.note },
  ].filter(Boolean) as { name: string; note?: string }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dev performance"
        hint="Кто сколько работает — по данным Jira и GitHub"
        action={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/admin/performance?days=${p}`}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors",
                  p === period
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p} дн.
              </Link>
            ))}
          </div>
        }
      />

      {broken.map((b) => (
        <div
          key={b.name}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium">{b.name} не подключён.</span>{" "}
            <span className="text-muted-foreground">{b.note} Настройка — в ADMIN.md.</span>
          </p>
        </div>
      ))}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Clock} value={`${data.totals.hoursLogged} ч`} label="Залогировано в Jira" tone="accent" />
        <Stat icon={ListChecks} value={String(data.totals.jiraDone)} label="Задач закрыто" />
        <Stat icon={GitCommitHorizontal} value={String(data.totals.commits)} label="Коммитов" />
        <Stat icon={GitPullRequest} value={String(data.totals.prsMerged)} label="PR влито" />
      </section>

      {data.people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="За период активности нет"
          hint="Когда подключены оба источника, здесь появится по строке на каждого разработчика."
        />
      ) : (
        <Panel title="По людям" description={`С ${formatDate(data.since)}`} flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Разработчик</th>
                  <th className="px-3 py-2.5 text-right font-medium">Часы</th>
                  <th className="px-3 py-2.5 text-right font-medium">Закрыто</th>
                  <th className="px-3 py-2.5 text-right font-medium">В работе</th>
                  <th className="px-3 py-2.5 text-right font-medium">Коммиты</th>
                  <th className="px-3 py-2.5 text-right font-medium">PR</th>
                  <th className="px-5 py-2.5 text-right font-medium">Последняя активность</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.name} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium">{p.name}</span>
                      {p.github && p.github !== p.name ? (
                        <span className="ml-2 text-xs text-muted-foreground">@{p.github}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular">{p.hoursLogged || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular">{p.jiraDone}</td>
                    <td className="px-3 py-3 text-right font-mono tabular">{p.jiraInProgress}</td>
                    <td className="px-3 py-3 text-right font-mono tabular">{p.commits}</td>
                    <td className="px-3 py-3 text-right font-mono tabular">{p.prsMerged}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{formatDate(p.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Коммиты по дням" description="Все репозитории организации">
        <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Коммиты по дням">
          {data.daily.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.commits}`}
              className="flex-1 rounded-sm bg-primary/70"
              style={{ height: `${Math.max(d.commits ? 6 : 2, (d.commits / peak) * 100)}%`, opacity: d.commits ? 1 : 0.25 }}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
