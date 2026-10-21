import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import {
  AuthzError, financeSummary, listExpenses, listProjects,
} from "@/lib/crm/repo";
import { ArrowDownToLine, ArrowUpFromLine, Hourglass, Scale, Wallet } from "lucide-react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/crm";
import {
  CURRENCY_OPTIONS, DEFAULT_CURRENCY, EmptyState, Panel, PageHeader, Stat,
  formatDate, formatMoney,
} from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField } from "@/components/crm/fields";
import { ExpenseDelete } from "@/components/crm/expense-delete";
import { addExpenseAction } from "../actions";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  SALARY: "Зарплаты",
  SERVICES: "Сервисы и подписки",
  MARKETING: "Маркетинг",
  TAXES: "Налоги",
  OTHER: "Прочее",
};

const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});
const monthLabel = (key: string) => {
  const label = MONTH_FORMAT.format(new Date(`${key}-01T00:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Company-wide money: what came in (project payments), what went out
 * (expenses), and what clients still owe. Currencies are never added together.
 */
export default async function FinancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let summary, expenses, projects;
  try {
    [summary, expenses, projects] = await Promise.all([
      financeSummary(),
      listExpenses(),
      listProjects(),
    ]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const canWrite = can(user.role, "finance.write");
  const projectName = (id?: string) =>
    projects.find((p) => p.id === id)?.name;
  const money = (amount: number, currency: string) =>
    amount === 0 ? "0" : formatMoney({ amount, currency });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Финансы"
        hint="Поступления считаются из платежей по проектам, расходы вносятся здесь."
      />

      {summary.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Движений по деньгам пока нет"
          hint="Запишите платёж в карточке проекта или добавьте расход справа."
        />
      ) : (
        summary.map((fin) => (
          <section key={fin.currency} className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Валюта: {fin.currency}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat icon={ArrowDownToLine} value={money(fin.income, fin.currency)} label="Получено" tone="accent" />
              <Stat icon={ArrowUpFromLine} value={money(fin.expenses, fin.currency)} label="Расходы" />
              <Stat
                icon={Scale}
                value={money(fin.balance, fin.currency)}
                label="Баланс"
                tone={fin.balance < 0 ? "warn" : "default"}
              />
              <Stat icon={Hourglass} value={money(fin.receivable, fin.currency)} label="Клиенты должны" />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Panel title="По месяцам" flush>
                <ul className="divide-y divide-border">
                  {fin.months.map((m) => (
                    <li key={m.month} className="flex justify-between gap-4 px-5 py-3 text-sm">
                      <span>{monthLabel(m.month)}</span>
                      <span className="tabular text-muted-foreground">
                        <span className="font-medium text-[var(--success)]">+{money(m.income, fin.currency)}</span>
                        {" · "}−{money(m.expenses, fin.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="По проектам" flush>
                {fin.projects.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground">Проектов в этой валюте нет.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {fin.projects.map((p) => {
                      const share = p.total > 0 ? Math.min(100, Math.round((p.paid / p.total) * 100)) : 0;
                      return (
                        <li key={p.id} className="px-5 py-3.5 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="font-medium">{p.name}</span>
                            <span className="tabular text-muted-foreground">{share}%</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground tabular">
                            {money(p.paid, fin.currency)} из {money(p.total, fin.currency)} · расходы {money(p.spent, fin.currency)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          </section>
        ))
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel title={`Расходы · ${expenses.length}`} flush>
          {expenses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Расходов пока нет.</p>
          ) : (
            <ul className="divide-y divide-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.note ?? CATEGORY_LABEL[e.category]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(e.paidAt)} · {CATEGORY_LABEL[e.category]}
                      {projectName(e.projectId) ? ` · ${projectName(e.projectId)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular">
                      {formatMoney({ amount: e.amount, currency: e.currency })}
                    </p>
                    {canWrite ? <ExpenseDelete expenseId={e.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {canWrite ? (
          <aside className="lg:sticky lg:top-20">
            <Panel title="Новый расход">
              <ActionForm action={addExpenseAction} submitLabel="Записать" pendingLabel="Записываем…">
                <FieldRow>
                  <Field label="Сумма" name="amount" required placeholder="500 000" />
                  <SelectField
                    label="Валюта" name="currency" defaultValue={DEFAULT_CURRENCY}
                    options={CURRENCY_OPTIONS}
                  />
                </FieldRow>
                <FieldRow>
                  <Field label="Дата" name="paidAt" type="date" />
                  <SelectField
                    label="Категория" name="category" defaultValue="OTHER"
                    options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
                  />
                </FieldRow>
                <SelectField
                  label="Проект" name="projectId" defaultValue=""
                  options={[
                    { value: "", label: "— общий расход —" },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
                <Field label="Комментарий" name="note" placeholder="Хостинг на месяц" />
              </ActionForm>
            </Panel>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
