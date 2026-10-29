import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canSeeFinance } from "@/lib/crm/rbac";
import { getCrm, teamOverview } from "@/lib/crm/repo";
import { storeWarning } from "@/lib/crm/store";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Handshake,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  EmptyState,
  PageHeader,
  Panel,
  PrimaryAction,
  Stat,
  StageBadge,
  formatDate,
  formatDateTime,
  formatTotals,
  sumByCurrency,
} from "@/components/crm/ui";

/**
 * The dashboard answers one question: what needs attention today. Everything
 * else is a click away — no wall of charts.
 */
export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const crm = await getCrm();
  const warning = await storeWarning();
  const showMoney = canSeeFinance(user.role);
  const team = user.role === "ADMIN" ? (await teamOverview()).members.filter((m) => m.active) : [];

  const leads = crm.leads.filter((l) => !l.deletedAt);
  const prospects = crm.prospects.filter((p) => !p.deletedAt);
  // Admin sees the whole team's tasks; everyone else only their own.
  const tasks = crm.tasks.filter(
    (t) => !t.deletedAt && (user.role === "ADMIN" || t.ownerId === user.id),
  );

  const today = new Date().toISOString().slice(0, 10);
  // Retired stages are included so a lead saved under one still counts.
  const openStages = ["NEW", "CONTACTED", "INTERESTED", "MEETING", "PROPOSAL", "NEGOTIATION"];

  const active = leads.filter((l) => openStages.includes(l.stage));
  const won = leads.filter((l) => l.stage === "WON");
  const lost = leads.filter((l) => l.stage === "LOST");
  const newToday = leads.filter((l) => l.createdAt.slice(0, 10) === today);

  const dueToday = tasks.filter(
    (t) => t.status !== "DONE" && t.dueAt?.slice(0, 10) === today,
  );
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && t.dueAt && t.dueAt.slice(0, 10) < today,
  );

  const followUps = active
    .filter((l) => l.nextActionAt)
    .sort((a, b) => (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? ""));
  const overdueFollowUps = followUps.filter(
    (l) => (l.nextActionAt ?? "").slice(0, 10) < today,
  );

  const price = (l: (typeof leads)[number]) => l.proposedPrice ?? l.budget;
  const pipelineValue = sumByCurrency(active.map(price));
  const wonValue = sumByCurrency(won.map(price));

  const isEmpty = leads.length === 0 && prospects.length === 0;
  // Enquiries from the site that nobody has picked up yet.
  const fresh = leads
    .filter((l) => l.source === "WEBSITE" && l.stage === "NEW")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const leadTitle = (l: (typeof leads)[number]) =>
    l.company ?? `${l.firstName} ${l.lastName ?? ""}`.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Привет, ${user.name.split(" ")[0]}`}
        hint={
          warning
            ? `Данные пишутся в локальный файл — ${warning}.`
            : "Что требует внимания сегодня"
        }
        action={<PrimaryAction href="/admin/crm/leads/new">Новый лид</PrimaryAction>}
      />

      {isEmpty ? (
        <EmptyState
          icon={UserPlus}
          title="В CRM пока пусто"
          hint="Добавьте первого лида — или соберите список компаний, которым стоит написать."
          action={<PrimaryAction href="/admin/crm/leads/new">Добавить лид</PrimaryAction>}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={UserPlus} value={String(newToday.length)} label="Новых лидов сегодня" href="/admin/crm/leads" />
        <Stat icon={Users} value={String(active.length)} label="Активных лидов" href="/admin/crm/pipeline" />
        <Stat
          icon={Clock3}
          value={String(dueToday.length)}
          label="Задач на сегодня"
          href="/admin/tracker"
          tone={dueToday.length ? "accent" : "default"}
        />
        <Stat
          icon={CalendarClock}
          value={String(overdue.length)}
          label="Просроченных задач"
          href="/admin/tracker"
          tone={overdue.length ? "warn" : "default"}
        />
      </section>

      {showMoney ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={TrendingUp} value={formatTotals(pipelineValue)} label="В воронке" />
          <Stat icon={Trophy} value={formatTotals(wonValue)} label="Выиграно" tone="accent" />
          <Stat icon={Handshake} value={String(won.length)} label="Успешных сделок" />
          <Stat icon={XCircle} value={String(lost.length)} label="Потерянных сделок" />
        </section>
      ) : null}

      {fresh.length > 0 ? (
        <Panel
          title={`Новые заявки с сайта · ${fresh.length}`}
          description="Пришли через форму на сайте и ждут ответа"
          flush
          action={
            <Link href="/admin/crm/leads" className="text-muted-foreground transition-colors hover:text-foreground">
              Все лиды
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {fresh.slice(0, 5).map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/admin/crm/leads/${lead.id}`}
                  className="group block px-5 py-3.5 transition-colors hover:bg-surface/60"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-sm font-medium group-hover:text-primary">
                      {leadTitle(lead)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {lead.email ?? lead.telegram ?? lead.phone ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(lead.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lead.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Следующие шаги"
          flush
          action={
            <Link href="/admin/crm/leads" className="text-muted-foreground transition-colors hover:text-foreground">
              Все лиды
            </Link>
          }
        >
          {followUps.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Ни у одного активного лида не назначено следующее действие.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {followUps.slice(0, 6).map((lead) => {
                const late = (lead.nextActionAt ?? "").slice(0, 10) < today;
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/crm/leads/${lead.id}`}
                      className="group block px-5 py-3.5 transition-colors hover:bg-surface/60"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="truncate text-sm font-medium group-hover:text-primary">
                          {leadTitle(lead)}
                        </span>
                        <span className={late ? "shrink-0 text-xs font-medium text-destructive" : "shrink-0 text-xs text-muted-foreground"}>
                          {formatDate(lead.nextActionAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {lead.nextActionTitle ?? "Без описания"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {overdueFollowUps.length > 0 ? (
            <p className="border-t border-border px-5 py-3 text-xs font-medium text-destructive">
              Просрочено: {overdueFollowUps.length}
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Последние лиды"
          flush
          action={
            <Link href="/admin/crm/pipeline" className="text-muted-foreground transition-colors hover:text-foreground">
              Воронка
            </Link>
          }
        >
          {leads.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Лидов пока нет.</p>
          ) : (
            <ul className="divide-y divide-border">
              {[...leads]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 6)
                .map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/crm/leads/${lead.id}`}
                      className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface/60"
                    >
                      <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                        {leadTitle(lead)}
                      </span>
                      <StageBadge stage={lead.stage} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </section>

      {team.length > 0 ? (
        <Panel
          title="Команда"
          description="Кто чем занят прямо сейчас"
          flush
          action={
            <Link href="/admin/team" className="text-muted-foreground transition-colors hover:text-foreground">
              Подробнее
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {team.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/tracker?owner=${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3.5 transition-colors hover:bg-surface/60"
                >
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="flex items-center gap-5 text-xs tabular text-muted-foreground">
                    <span>{m.open} открытых</span>
                    <span className={m.overdue ? "font-medium text-destructive" : ""}>{m.overdue} просрочено</span>
                    <span className="inline-flex items-center gap-1 text-[var(--success)]">
                      <CheckCircle2 className="size-3.5" />
                      {m.doneLastWeek} за неделю
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
