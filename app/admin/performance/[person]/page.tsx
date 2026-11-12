import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlarmClock,
  ArrowLeft,
  CircleDot,
  GitCommitHorizontal,
  GitPullRequest,
  ListChecks,
  RotateCcw,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import { PERIODS, type Period } from "@/lib/performance";
import { buildPersonDetail, type PersonTask } from "@/lib/performance/person";
import { EmptyState, PageHeader, Panel, Stat, formatDate, formatDateTime } from "@/components/crm/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function duration(hours?: number) {
  if (hours === undefined) return "—";
  if (hours < 24) return `${Math.round(hours)} ч`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest ? `${days} д ${rest} ч` : `${days} д`;
}

const TONE = {
  ok: "bg-[var(--success-soft)] text-[var(--success)]",
  bad: "bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-[var(--destructive)]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
  live: "bg-primary-soft text-primary",
  muted: "bg-surface text-muted-foreground",
} as const;

function Chip({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", TONE[tone])}>
      {children}
    </span>
  );
}

function taskTone(t: PersonTask): keyof typeof TONE {
  if (t.category === "done") return "ok";
  return "live";
}

export default async function PersonPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "team.view")) redirect("/admin");

  const { person } = await params;
  // Next may hand the segment over still encoded (non-ASCII names); decoding twice is harmless.
  let name = person;
  try {
    name = decodeURIComponent(person);
  } catch {
    // A stray "%" in a name: keep the raw segment.
  }
  const { days } = await searchParams;
  const period = (PERIODS.find((p) => String(p) === days) ?? 30) as Period;

  let d;
  try {
    d = await buildPersonDetail(name, period);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const s = d.summary;
  const self = `/admin/performance/${encodeURIComponent(name)}`;
  const broken = [
    !d.github.ok && { name: "GitHub", note: d.github.note },
    !d.jira.ok && { name: "Jira", note: d.jira.note },
  ].filter(Boolean) as { name: string; note?: string }[];
  const openIssues = d.issues.filter((i) => i.open);
  const closedIssues = d.issues.filter((i) => !i.open && (i.closedAt ?? "") >= d.since);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/performance?days=${period}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Вся команда
      </Link>

      <PageHeader
        title={d.name}
        hint={`Подробно с ${formatDate(d.since)}: Jira и GitHub`}
        action={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`${self}?days=${p}`}
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
        <div key={b.name} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium">{b.name} не подключён.</span>{" "}
            <span className="text-muted-foreground">{b.note}</span>
          </p>
        </div>
      ))}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ListChecks} value={`${s.tasksDone}`} label={`Задач закрыто · в работе ${s.tasksInProgress}`} />
        <Stat icon={Timer} value={duration(s.avgCycleHours)} label="Среднее время задачи" />
        <Stat
          icon={RotateCcw}
          value={`${s.mistakes}`}
          label="Косяки: возвраты и переоткрытия"
          tone={s.mistakes ? "warn" : "default"}
        />
        <Stat icon={AlarmClock} value={`${s.overdue}`} label="Просрочено по дедлайну" tone={s.overdue ? "warn" : "default"} />
        <Stat icon={GitCommitHorizontal} value={`${s.commits}`} label="Коммитов в основных ветках" />
        <Stat
          icon={GitPullRequest}
          value={`${s.pullsMerged}`}
          label={`PR влито · неудачных ${s.pullsFailed} · открыто ${s.pullsOpen}`}
        />
        <Stat
          icon={CircleDot}
          value={`${s.issuesClosed}`}
          label={`Issues закрыто · создал ${s.issuesCreated} · висит ${s.issuesOpen}`}
        />
        <Stat
          icon={GitCommitHorizontal}
          value={`${d.repos.active.length} из ${d.repos.active.length + d.repos.untouched.length}`}
          label="Репозиториев с его участием"
        />
      </section>

      <Panel
        title="Задачи Jira"
        description="Засчитаны тому, кто брал задачу в работу. Время — от первого «В работе» до закрытия."
        flush
      >
        {d.tasks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Задач за период нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Задача</th>
                  <th className="px-3 py-2.5 font-medium">Статус</th>
                  <th className="px-3 py-2.5 text-right font-medium">Время</th>
                  <th className="px-3 py-2.5 font-medium">Что было</th>
                  <th className="px-3 py-2.5 font-medium">Дедлайн</th>
                  <th className="px-5 py-2.5 text-right font-medium">Закрыта</th>
                </tr>
              </thead>
              <tbody>
                {d.tasks.map((t) => (
                  <tr key={t.key} className="border-b border-border align-top last:border-0">
                    <td className="max-w-[28rem] px-5 py-3">
                      <a href={t.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline">
                        {t.key}
                      </a>
                      <p className="mt-0.5 leading-snug">{t.summary}</p>
                      {t.path.length ? (
                        <p
                          className="mt-1 text-xs text-muted-foreground"
                          title={t.path.map((p) => `${formatDateTime(p.at)} → ${p.to}`).join("\n")}
                        >
                          {t.path.map((p) => p.to).join(" → ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Chip tone={taskTone(t)}>{t.status}</Chip>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular">
                      {duration(t.cycleHours)}
                      {t.hoursLogged ? (
                        <span className="block text-xs text-muted-foreground">лог {t.hoursLogged} ч</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.returnedFromReview ? <Chip tone="warn">с проверки ×{t.returnedFromReview}</Chip> : null}
                        {t.backToBacklog ? <Chip tone="warn">в бэклог ×{t.backToBacklog}</Chip> : null}
                        {t.reopened ? <Chip tone="bad">переоткрыта ×{t.reopened}</Chip> : null}
                        {!t.returnedFromReview && !t.backToBacklog && !t.reopened ? (
                          <span className="text-xs text-muted-foreground">чисто</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {t.dueDate ? (
                        t.overdue ? (
                          <Chip tone="bad">{formatDate(t.dueDate)} · просрочено</Chip>
                        ) : (
                          <span className="text-muted-foreground">{formatDate(t.dueDate)}</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">нет</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {formatDate(t.doneAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Pull requests" description="Влитые, закрытые без мержа (неудачные) и открытые" flush>
          {d.pulls.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">PR за период нет.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.pulls.map((p) => (
                <li key={`${p.repo}#${p.number}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.title}
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.repo} #{p.number} → {p.base} · {formatDate(p.closedAt ?? p.createdAt)}
                    </p>
                  </div>
                  {p.state === "merged" ? (
                    <Chip tone="ok">влит</Chip>
                  ) : p.state === "closed" ? (
                    <Chip tone="bad">не влит</Chip>
                  ) : (
                    <Chip tone="live">открыт</Chip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Issues" description="Созданные им и назначенные на него" flush>
          {openIssues.length + closedIssues.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Issues нет.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {[...openIssues, ...closedIssues].map((i) => (
                <li key={`${i.repo}#${i.number}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {i.title}
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {i.repo} #{i.number} · {i.authored ? "создал" : "назначен"} {formatDate(i.createdAt)}
                      {i.closedAt ? ` · закрыт ${formatDate(i.closedAt)}` : ""}
                    </p>
                  </div>
                  {i.open ? <Chip tone="warn">не закрыт</Chip> : <Chip tone="ok">закрыт</Chip>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Коммиты" description={`${d.commits.length} в основных ветках репозиториев`} flush>
          {d.commits.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Коммитов за период нет.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto text-sm">
              {d.commits.map((c) => (
                <li key={`${c.repo}-${c.sha}`} className="px-5 py-2.5">
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {c.message}
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{c.sha}</span> · {c.repo} · {formatDateTime(c.date)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Репозитории" description="Где участвовал за период и где нет" flush>
          {d.repos.active.length === 0 && d.repos.untouched.length === 0 ? (
            <EmptyState icon={GitCommitHorizontal} title="Нет данных GitHub" />
          ) : (
            <div className="text-sm">
              <ul className="divide-y divide-border">
                {d.repos.active.map((r) => (
                  <li key={r.repo} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="font-medium">{r.repo}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {r.commits} комм. · {r.pulls} PR · {r.issues} issues
                    </span>
                  </li>
                ))}
              </ul>
              {d.repos.untouched.length ? (
                <div className="border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">Не участвовал</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.repos.untouched.map((r) => (
                      <Chip key={r} tone="muted">
                        {r}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
