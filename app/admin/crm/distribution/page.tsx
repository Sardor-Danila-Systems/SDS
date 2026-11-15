import Link from "next/link";
import { redirect } from "next/navigation";
import { PieChart } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, distributionOverview } from "@/lib/crm/repo";
import {
  PARTICIPANT_LABEL,
  SCHEMES,
  SCHEME_VERSIONS,
  schemeFor,
  type Basis,
  type CurrencyDistribution,
} from "@/lib/crm/distribution";
import type { ClientProject } from "@/types/crm";
import { EmptyState, Panel, PageHeader } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { FieldRow, SelectField } from "@/components/crm/fields";
import { DistributionCalculator } from "@/components/crm/distribution-calculator";
import { formatShare } from "@/components/crm/distribution-format";
import { cn } from "@/lib/utils";
import { setProjectDistributionAction } from "../actions";

const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const monthLabel = (key: string) => {
  const label = MONTH_FORMAT.format(new Date(`${key}-01T00:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const BASIS: { value: Basis; label: string; hint: string }[] = [
  { value: "cash", label: "Касса", hint: "делим то, что клиенты уже заплатили" },
  { value: "expected", label: "Ожидаемое", hint: "делим полную цену проектов" },
];

/**
 * Who gets what from each project under the SDS split. The numbers come from
 * `lib/crm/distribution.ts`; this page only lays them out.
 */
export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const basis: Basis = (await searchParams).basis === "expected" ? "expected" : "cash";

  let overview;
  try {
    overview = await distributionOverview(basis);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const { report, projects, people, names } = overview;
  const canWrite = can(user.role, "finance.write");
  const label = (key: string) => PARTICIPANT_LABEL[key] ?? names[key] ?? "Бывший сотрудник";
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Распределение"
        hint="Кто сколько получает с каждого проекта по схеме SDS. Валюты не складываются."
        action={
          <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
            {BASIS.map((b) => (
              <Link
                key={b.value}
                href={b.value === "cash" ? "?" : `?basis=${b.value}`}
                title={b.hint}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  b.value === basis
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {b.label}
              </Link>
            ))}
          </div>
        }
      />

      <Panel title="Калькулятор">
        <DistributionCalculator />
      </Panel>

      <p className="text-sm text-muted-foreground">
        Режим: <span className="font-medium text-foreground">{BASIS.find((b) => b.value === basis)!.label}</span>{" "}
        — {BASIS.find((b) => b.value === basis)!.hint}.
      </p>

      {report.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="Проектов пока нет"
          hint="Распределение появится, когда в CRM будут проекты с ценой или платежами."
        />
      ) : (
        report.map((entry) => (
          <CurrencySection
            key={entry.currency}
            entry={entry}
            label={label}
            project={(id) => byId.get(id)}
            people={people}
            canWrite={canWrite}
          />
        ))
      )}
    </div>
  );
}

function CurrencySection({
  entry,
  label,
  project,
  people,
  canWrite,
}: {
  entry: CurrencyDistribution;
  label: (key: string) => string;
  project: (id: string) => ClientProject | undefined;
  people: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const money = (n: number | undefined) => formatShare(n ?? 0, entry.currency);
  const groups = [
    { title: "С разработчиками", rows: entry.projects.filter((p) => p.withDevelopers) },
    { title: "Без разработчиков", rows: entry.projects.filter((p) => !p.withDevelopers) },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Валюта: {entry.currency}</h2>

      <Panel title="Итог на каждого" description="Заработано минус уже выданное (расходы с получателем)" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-medium">Кто</th>
                <th className="px-5 py-2.5 text-right font-medium">Заработано</th>
                <th className="px-5 py-2.5 text-right font-medium">Выдано</th>
                <th className="px-5 py-2.5 text-right font-medium">Осталось получить</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entry.keys.map((key) => (
                <tr key={key}>
                  <td className="px-5 py-2.5">{label(key)}</td>
                  <td className="px-5 py-2.5 text-right tabular">{money(entry.earned[key])}</td>
                  <td className="px-5 py-2.5 text-right tabular text-muted-foreground">{money(entry.paidOut[key])}</td>
                  <td
                    className={cn(
                      "px-5 py-2.5 text-right font-medium tabular",
                      (entry.remaining[key] ?? 0) < 0 && "text-destructive",
                    )}
                  >
                    {money(entry.remaining[key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="По месяцам" flush>
        {entry.months.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Поступлений пока нет.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entry.months.map((m) => (
              <li key={m.month} className="px-5 py-4">
                <p className="text-sm font-semibold">{monthLabel(m.month)}</p>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {[
                    { title: "С разработчиками", data: m.withDevelopers },
                    { title: "Без разработчиков", data: m.withoutDevelopers },
                    { title: "Всего за месяц", data: m.total },
                  ].map((col) => (
                    <div key={col.title}>
                      <p className="label mb-1.5">{col.title}</p>
                      {Object.keys(col.data).length === 0 ? (
                        <p className="text-xs text-subtle-foreground">—</p>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {entry.keys
                            .filter((k) => col.data[k] !== undefined)
                            .map((k) => (
                              <li key={k} className="flex justify-between gap-3">
                                <span className="text-muted-foreground">{label(k)}</span>
                                <span className="tabular">{money(col.data[k])}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {groups.map((group) => (
        <Panel key={group.title} title={`${group.title} · ${group.rows.length}`} flush>
          {group.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Таких проектов нет.</p>
          ) : (
            <ul className="divide-y divide-border">
              {group.rows.map((row) => {
                const source = project(row.id);
                const lead = row.executors.find((e) => e.role === "lead");
                const helper = row.executors.find((e) => e.role === "helper");
                return (
                  <li key={row.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {SCHEMES[row.scheme].label}
                          {source?.schemeVersion ? "" : " · по дате"}
                          {row.builtByOwners
                            ? " · сделали собственники"
                            : row.executors.length
                              ? ` · ${row.executors.map((e) => label(`user:${e.userId}`)).join(", ")}`
                              : " · исполнитель не указан"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground tabular">
                        цена {money(row.total)} · оплачено {money(row.paid)} · долг {money(row.debt)}
                      </p>
                    </div>

                    <ul className="mt-3 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      {row.lines.map((line) => (
                        <li key={line.key} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">{label(line.key)}</span>
                          <span className="tabular">{money(line.amount)}</span>
                        </li>
                      ))}
                    </ul>

                    {canWrite && source ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground">
                          Схема и исполнители
                        </summary>
                        <div className="mt-3 max-w-xl">
                          <ActionForm
                            action={setProjectDistributionAction.bind(null, row.id)}
                            submitLabel="Сохранить"
                            pendingLabel="Сохраняем…"
                            resetOnSuccess={false}
                          >
                            <SelectField
                              label="Схема"
                              name="scheme"
                              defaultValue={source.schemeVersion ?? ""}
                              options={[
                                {
                                  value: "",
                                  label: `По дате создания (${SCHEMES[schemeFor({ createdAt: source.createdAt })].label})`,
                                },
                                ...SCHEME_VERSIONS.map((v) => ({ value: v, label: SCHEMES[v].label })),
                              ]}
                            />
                            <FieldRow>
                              <SelectField
                                label="Ведущий исполнитель"
                                name="lead"
                                defaultValue={lead?.userId ?? ""}
                                options={[{ value: "", label: "—" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
                              />
                              <SelectField
                                label="Помощник"
                                name="helper"
                                defaultValue={helper?.userId ?? ""}
                                options={[{ value: "", label: "—" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
                              />
                            </FieldRow>
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="builtByOwners" defaultChecked={row.builtByOwners} />
                              Сделали собственники — доля исполнителя уходит в фонд
                            </label>
                          </ActionForm>
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ))}
    </section>
  );
}
