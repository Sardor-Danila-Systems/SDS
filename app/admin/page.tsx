import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canSeeFinance } from "@/lib/crm/rbac";
import { getCrm } from "@/lib/crm/repo";
import { storeWarning } from "@/lib/crm/store";
import {
  EmptyState,
  PageHeader,
  PrimaryAction,
  Stat,
  StageBadge,
  formatDate,
  formatMoney,
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

  const sum = (rows: typeof leads, pick: (l: (typeof leads)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const pipelineValue = sum(active, (l) => l.proposedPrice?.amount ?? l.budget?.amount ?? 0);
  const wonValue = sum(won, (l) => l.proposedPrice?.amount ?? l.budget?.amount ?? 0);
  const currency =
    active[0]?.proposedPrice?.currency ?? active[0]?.budget?.currency ?? "UZS";

  const isEmpty = leads.length === 0 && prospects.length === 0;

  return (
    <div className="space-y-12">
      <PageHeader
        label="Сегодня"
        title={`Привет, ${user.name.split(" ")[0]}`}
        hint={
          warning
            ? `Данные пишутся в локальный файл — ${warning}.`
            : undefined
        }
        action={<PrimaryAction href="/admin/crm/leads/new">Новый лид</PrimaryAction>}
      />

      {isEmpty ? (
        <EmptyState
          title="В CRM пока пусто"
          hint="Добавьте первого лида — или соберите список компаний, которым стоит написать."
          action={
            <PrimaryAction href="/admin/crm/leads/new">
              Добавить лид
            </PrimaryAction>
          }
        />
      ) : null}

      <section className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={String(newToday.length)} label="Новых лидов сегодня" href="/admin/crm/leads" />
        <Stat value={String(active.length)} label="Активных лидов" href="/admin/crm/pipeline" />
        <Stat
          value={String(dueToday.length)}
          label="Задач на сегодня"
          href="/admin/crm/tasks"
          tone={dueToday.length ? "accent" : "default"}
        />
        <Stat
          value={String(overdue.length)}
          label="Просроченных задач"
          href="/admin/crm/tasks"
          tone={overdue.length ? "warn" : "default"}
        />
      </section>

      {showMoney ? (
        <section className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={formatMoney({ amount: pipelineValue, currency })} label="В воронке" />
          <Stat value={formatMoney({ amount: wonValue, currency })} label="Выиграно" tone="accent" />
          <Stat value={String(won.length)} label="Успешных сделок" />
          <Stat value={String(lost.length)} label="Потерянных сделок" />
        </section>
      ) : null}

      <section className="grid gap-12 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <h2 className="label">Следующие шаги</h2>
            <Link
              href="/admin/crm/leads"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Все лиды
            </Link>
          </div>

          {followUps.length === 0 ? (
            <p className="py-8 text-[0.9375rem] text-muted-foreground">
              Ни у одного активного лида не назначено следующее действие.
            </p>
          ) : (
            <ul>
              {followUps.slice(0, 6).map((lead) => {
                const late = (lead.nextActionAt ?? "").slice(0, 10) < today;
                return (
                  <li key={lead.id} className="border-b border-border py-4">
                    <Link href={`/admin/crm/leads/${lead.id}`} className="group block">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-medium transition-colors group-hover:text-primary">
                          {lead.company ?? `${lead.firstName} ${lead.lastName ?? ""}`}
                        </span>
                        <span className={late ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                          {formatDate(lead.nextActionAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {lead.nextActionTitle ?? "Без описания"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {overdueFollowUps.length > 0 ? (
            <p className="mt-4 text-sm text-destructive">
              Просрочено: {overdueFollowUps.length}
            </p>
          ) : null}
        </div>

        <div>
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <h2 className="label">Последние лиды</h2>
            <Link
              href="/admin/crm/pipeline"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Воронка
            </Link>
          </div>

          {leads.length === 0 ? (
            <p className="py-8 text-[0.9375rem] text-muted-foreground">Лидов пока нет.</p>
          ) : (
            <ul>
              {[...leads]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 6)
                .map((lead) => (
                  <li key={lead.id} className="border-b border-border py-4">
                    <Link
                      href={`/admin/crm/leads/${lead.id}`}
                      className="group flex items-baseline justify-between gap-4"
                    >
                      <span className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">
                        {lead.company ?? `${lead.firstName} ${lead.lastName ?? ""}`}
                      </span>
                      <StageBadge stage={lead.stage} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
