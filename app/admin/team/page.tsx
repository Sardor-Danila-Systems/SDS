import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthzError, teamOverview } from "@/lib/crm/repo";
import { ROLES } from "@/types/crm";
import { EmptyState, PageHeader, Stat, formatDate } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, SelectField } from "@/components/crm/fields";
import { UserActiveToggle } from "@/components/crm/user-active";
import { createUserAction } from "../crm/actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Админ",
  SALES: "Отдел продаж",
  DEVELOPER: "Разработчик",
};

/**
 * The admin's overview of the team: who is working on what, who is behind,
 * what just happened in the CRM, and who has an account.
 */
export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let overview;
  try {
    overview = await teamOverview();
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const { members, feed } = overview;

  const active = members.filter((m) => m.active);
  const totals = active.reduce(
    (acc, m) => ({
      open: acc.open + m.open,
      overdue: acc.overdue + m.overdue,
      done: acc.done + m.doneLastWeek,
    }),
    { open: 0, overdue: 0, done: 0 },
  );

  return (
    <div className="space-y-12">
      <PageHeader
        label="Управление"
        title="Команда"
        hint="Кто чем занят, что просрочено и что происходит в CRM."
      />

      <section className="grid gap-x-8 gap-y-10 sm:grid-cols-3">
        <Stat value={String(totals.open)} label="Открытых задач" href="/admin/crm/tasks" />
        <Stat
          value={String(totals.overdue)}
          label="Просрочено"
          tone={totals.overdue ? "warn" : "default"}
          href="/admin/crm/tasks"
        />
        <Stat value={String(totals.done)} label="Выполнено за 7 дней" tone="accent" />
      </section>

      <section>
        <h2 className="label border-b border-border pb-3">Сотрудники</h2>
        <ul>
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-border py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/crm/tasks?user=${m.id}`}
                  className={m.active ? "font-medium hover:text-primary" : "text-muted-foreground line-through"}
                >
                  {m.name}
                </Link>
                <p className="mt-1 text-xs text-subtle-foreground">
                  {ROLE_LABEL[m.role] ?? m.role} · {m.login}
                  {m.active ? "" : " · отключён"}
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm tabular">
                <span title="Открытых">{m.open} откр.</span>
                <span title="В работе" className="text-muted-foreground">{m.inProgress} в работе</span>
                <span
                  title="Просрочено"
                  className={m.overdue ? "text-destructive" : "text-muted-foreground"}
                >
                  {m.overdue} проср.
                </span>
                <span title="Выполнено за 7 дней" className="text-primary">+{m.doneLastWeek}</span>
                {m.id !== "bootstrap-admin" && m.id !== user.id ? (
                  <UserActiveToggle userId={m.id} active={m.active} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="label border-b border-border pb-3">Что происходит</h2>
          {feed.length === 0 ? (
            <EmptyState title="Пока тихо" hint="Здесь появятся действия сотрудников: задачи, лиды, платежи." />
          ) : (
            <ul>
              {feed.map((a) => (
                <li key={a.id} className="border-b border-border py-3 text-sm">
                  <p>{a.summary}</p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {a.actorName} · {formatDate(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <h2 className="label border-b border-border pb-3">Новый аккаунт</h2>
          <div className="mt-6">
            <ActionForm action={createUserAction} submitLabel="Создать" pendingLabel="Создаём…">
              <Field label="Имя" name="name" required placeholder="Алиса Иванова" />
              <Field label="Логин" name="login" required placeholder="alisa" />
              <Field label="Пароль" name="password" type="password" required placeholder="не короче 8 символов" />
              <SelectField
                label="Роль" name="role" defaultValue="SALES"
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
              />
            </ActionForm>
            <p className="mt-4 text-xs text-subtle-foreground">
              Отдел продаж видит только свои задачи, лиды, воронку и клиентов — без финансов компании, портфолио и управления командой.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
