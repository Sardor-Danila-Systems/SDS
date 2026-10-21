import { redirect } from "next/navigation";
import { AuthzError, listProspects } from "@/lib/crm/repo";
import { getSessionUser } from "@/lib/auth";
import { PROSPECT_STAGES } from "@/types/crm";
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  EmptyState,
  Panel, PageHeader,
  SOURCE_LABEL,
  StageBadge,
  STAGE_LABEL,
  formatDate,
  formatMoney,
  sourceOptions,
} from "@/components/crm/ui";
import { ActionForm, ActionButton } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { addProspectAction, convertProspectAction } from "../actions";

/**
 * The register of companies worth approaching. Deliberately a short form —
 * the rest of the detail belongs on the lead, once there is one.
 */
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let prospects;
  try {
    prospects = await listProspects();
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const { stage, q } = await searchParams;
  const needle = q?.toLowerCase().trim();

  const filtered = prospects.filter((p) => {
    if (stage && p.stage !== stage) return false;
    if (!needle) return true;
    return [p.company, p.contactName, p.email, p.phone, p.city]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-6">
      <PageHeader
        label="Продажи"
        title="Кому написать"
        hint={`${prospects.length} компаний в списке`}
      />

      <form className="flex flex-wrap items-center gap-3" method="get">
        <input
          id="q" name="q" defaultValue={q ?? ""} aria-label="Поиск"
          placeholder="Компания, контакт, город"
          className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <select
          name="stage" defaultValue={stage ?? ""} aria-label="Этап"
          className="h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <option value="">Все этапы</option>
          {PROSPECT_STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface">
          Применить
        </button>
      </form>

      <section className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          {filtered.length === 0 ? (
            <EmptyState
              title={prospects.length ? "Ничего не найдено" : "Реестр пуст"}
              hint={
                prospects.length
                  ? "Измените фильтры."
                  : "Добавьте первую компанию, которой стоит написать или позвонить."
              }
            />
          ) : (
            <Panel flush>
            <ul className="divide-y divide-border">
              {filtered.map((p) => (
                <li key={p.id} className="grid gap-3 px-5 py-4 md:grid-cols-12 md:items-baseline md:gap-6">
                  <div className="md:col-span-4">
                    <p className="text-sm font-medium">{p.company}</p>
                    {p.contactName ? (
                      <p className="mt-1 text-sm text-muted-foreground">{p.contactName}</p>
                    ) : null}
                    {p.website ? (
                      <a href={p.website} target="_blank" rel="noopener noreferrer" className="num mt-1 block text-subtle-foreground hover:text-foreground">
                        {p.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : null}
                  </div>
                  <div className="md:col-span-2"><StageBadge stage={p.stage} /></div>
                  <div className="text-sm text-muted-foreground md:col-span-2">
                    {p.service ?? "—"}
                    <span className="block text-subtle-foreground">{SOURCE_LABEL[p.source] ?? p.source}</span>
                  </div>
                  <div className="text-sm md:col-span-2">
                    {formatMoney(p.estimatedBudget)}
                    <span className="block text-subtle-foreground">
                      {p.nextActionTitle ? `${p.nextActionTitle} · ${formatDate(p.nextActionAt)}` : "нет действия"}
                    </span>
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    {p.convertedLeadId ? (
                      <span className="text-sm text-subtle-foreground">переведён в лид</span>
                    ) : (
                      <ActionButton action={convertProspectAction.bind(null, p.id)}>
                        В лиды →
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            </Panel>
          )}
        </div>

        <aside className="lg:sticky lg:top-20">
          <Panel title="Добавить">
          <div>
            <ActionForm action={addProspectAction} submitLabel="Добавить" pendingLabel="Добавляем…">
              <Field label="Компания" name="company" required placeholder="Registon Coffee" />
              <Field label="Контакт" name="contactName" placeholder="Азиз" />
              <FieldRow>
                <Field label="Телефон" name="phone" placeholder="+998 90 123 45 67" />
                <Field label="Telegram" name="telegram" placeholder="@username" />
              </FieldRow>
              <FieldRow>
                <Field label="Instagram" name="instagram" placeholder="@registon.coffee" />
                <Field label="Город" name="city" placeholder="Самарканд" />
              </FieldRow>
              <Field label="Что можем сделать" name="service" placeholder="Сайт для кафе" />
              <FieldRow>
                <Field label="Бюджет" name="budget" placeholder="5 000 000" />
                <SelectField
                  label="Валюта" name="currency" defaultValue={DEFAULT_CURRENCY}
                  options={CURRENCY_OPTIONS}
                />
              </FieldRow>
              <SelectField
                label="Откуда" name="source" defaultValue="INSTAGRAM"
                options={sourceOptions()}
              />
              <FieldRow>
                <Field label="Следующее действие" name="nextActionTitle" placeholder="Позвонить" />
                <Field label="Когда" name="nextActionAt" type="date" />
              </FieldRow>
              <TextField label="Заметки" name="notes" rows={2} />
            </ActionForm>
          </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
