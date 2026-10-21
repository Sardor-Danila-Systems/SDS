import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthzError, teamOverview } from "@/lib/crm/repo";
import { CheckCircle2, ListChecks, TriangleAlert } from "lucide-react";
import { ROLES } from "@/types/crm";
import { EmptyState, Panel, PageHeader, Stat, formatDate } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, SelectField } from "@/components/crm/fields";
import { PasswordField } from "@/components/crm/password-field";
import { UserActiveToggle } from "@/components/crm/user-active";
import { createUserAction, setUserPasswordAction } from "../crm/actions";

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
    <div className="space-y-6">
      <PageHeader
        title="Команда"
        hint="Кто чем занят, что просрочено и что происходит в CRM."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat icon={ListChecks} value={String(totals.open)} label="Открытых задач" href="/admin/tracker" />
        <Stat
          icon={TriangleAlert}
          value={String(totals.overdue)}
          label="Просрочено"
          tone={totals.overdue ? "warn" : "default"}
          href="/admin/tracker"
        />
        <Stat icon={CheckCircle2} value={String(totals.done)} label="Выполнено за 7 дней" tone="accent" />
      </section>

      <Panel title="Сотрудники" flush>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-3.5"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/tracker?owner=${m.id}`}
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
              {m.id !== "bootstrap-admin" ? (
                <details className="group w-full">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground">
                    Задать новый пароль
                  </summary>
                  <div className="mt-3 max-w-xs">
                    <ActionForm
                      action={setUserPasswordAction.bind(null, m.id)}
                      submitLabel="Сохранить пароль"
                      pendingLabel="Сохраняем…"
                      savedLabel="Пароль изменён"
                    >
                      <PasswordField name="next" label="Новый пароль" autoComplete="new-password" placeholder="не короче 8 символов" />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel title="Что происходит" flush>
          {feed.length === 0 ? (
            <EmptyState title="Пока тихо" hint="Здесь появятся действия сотрудников: задачи, лиды, платежи." />
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p>{a.summary}</p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {a.actorName} · {formatDate(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <aside className="lg:sticky lg:top-20">
          <Panel title="Новый аккаунт">
          <div>
            <ActionForm action={createUserAction} submitLabel="Создать" pendingLabel="Создаём…">
              <Field label="Имя" name="name" required placeholder="Алиса Иванова" />
              <Field label="Логин" name="login" required placeholder="alisa" />
              <PasswordField label="Пароль" name="password" placeholder="не короче 8 символов" autoComplete="new-password" />
              <SelectField
                label="Роль" name="role" defaultValue="SALES"
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
              />
            </ActionForm>
            <p className="mt-4 text-xs text-subtle-foreground">
              Отдел продаж видит только свои задачи, лиды, воронку и клиентов — без финансов компании, портфолио и управления командой.
            </p>
          </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
