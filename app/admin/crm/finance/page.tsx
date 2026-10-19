import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import {
  AuthzError, financeSummary, listExpenses, listProjects,
} from "@/lib/crm/repo";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/crm";
import {
  CURRENCY_OPTIONS, DEFAULT_CURRENCY, EmptyState, PageHeader, Stat,
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
    <div className="space-y-12">
      <PageHeader
        label="Работа"
        title="Финансы"
        hint="Поступления считаются из платежей по проектам, расходы вносятся здесь."
      />

      {summary.length === 0 ? (
        <EmptyState
          title="Движений по деньгам пока нет"
          hint="Запишите платёж в карточке проекта или добавьте расход справа."
        />
      ) : (
        summary.map((fin) => (
          <section key={fin.currency} className="space-y-8">
            <h2 className="label border-b border-border pb-3">{fin.currency}</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <Stat value={money(fin.income, fin.currency)} label="Получено" tone="accent" />
              <Stat value={money(fin.expenses, fin.currency)} label="Расходы" />
              <Stat
                value={money(fin.balance, fin.currency)}
                label="Баланс"
                tone={fin.balance < 0 ? "warn" : "default"}
              />
              <Stat value={money(fin.receivable, fin.currency)} label="Клиенты должны" />
            </div>

            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <p className="label mb-3">По месяцам</p>
                <ul className="border-t border-border">
                  {fin.months.map((m) => (
                    <li key={m.month} className="flex justify-between border-b border-border py-3 text-sm">
                      <span>{monthLabel(m.month)}</span>
                      <span className="tabular text-muted-foreground">
                        <span className="text-primary">+{money(m.income, fin.currency)}</span>
                        {" · "}−{money(m.expenses, fin.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="label mb-3">По проектам</p>
                {fin.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Проектов в этой валюте нет.</p>
                ) : (
                  <ul className="border-t border-border">
                    {fin.projects.map((p) => (
                      <li key={p.id} className="border-b border-border py-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <span>{p.name}</span>
                          <span className="tabular">{money(p.paid, fin.currency)} из {money(p.total, fin.currency)}</span>
                        </div>
                        <p className="mt-1 text-xs text-subtle-foreground">
                          расходы {money(p.spent, fin.currency)} · остаток {money(p.remaining, fin.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))
      )}

      <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="label border-b border-border pb-3">Расходы · {expenses.length}</h2>
          {expenses.length === 0 ? (
            <p className="mt-6 text-[0.9375rem] text-muted-foreground">Расходов пока нет.</p>
          ) : (
            <ul>
              {expenses.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-4 border-b border-border py-4">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem]">{e.note ?? CATEGORY_LABEL[e.category]}</p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      {formatDate(e.paidAt)} · {CATEGORY_LABEL[e.category]}
                      {projectName(e.projectId) ? ` · ${projectName(e.projectId)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[0.9375rem]">
                      {formatMoney({ amount: e.amount, currency: e.currency })}
                    </p>
                    {canWrite ? <ExpenseDelete expenseId={e.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canWrite ? (
          <aside>
            <h2 className="label border-b border-border pb-3">Новый расход</h2>
            <div className="mt-6">
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
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
