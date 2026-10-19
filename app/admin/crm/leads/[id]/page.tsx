import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { canSeeFinance } from "@/lib/crm/rbac";
import { AuthzError, activitiesFor, getLead } from "@/lib/crm/repo";
import { ACTIVITY_KINDS, PRIORITIES } from "@/types/crm";
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  PRIORITY_LABEL,
  SOURCE_LABEL,
  StageBadge,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/components/crm/ui";
import { ActionButton, ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { StagePicker } from "@/components/crm/stage-picker";
import {
  addActivityAction,
  convertLeadAction,
  setNextActionAction,
  updateLeadAction,
} from "../../actions";

const KIND_LABEL: Record<string, string> = {
  NOTE: "Заметка", CALL: "Звонок", MEETING: "Встреча", MESSAGE: "Сообщение",
  EMAIL: "Email", PROPOSAL_SENT: "КП отправлено", STATUS_CHANGE: "Статус",
  PAYMENT: "Оплата", EXPENSE: "Расход", TASK_COMPLETED: "Задача", PROJECT_CREATED: "Проект",
  CONVERTED: "Конвертация", CREATED: "Создано", UPDATED: "Изменено",
};

/** What can be logged by hand — the rest is written by the system. */
const MANUAL_KINDS = ACTIVITY_KINDS.filter((k) =>
  ["CALL", "MEETING", "MESSAGE", "EMAIL", "NOTE", "PROPOSAL_SENT"].includes(k),
);

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-[0.9375rem]">{value || "—"}</span>
    </div>
  );
}

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const { id } = await params;

  let lead;
  try {
    lead = await getLead(id);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  if (!lead) notFound();

  const timeline = await activitiesFor("lead", lead.id);
  const showMoney = canSeeFinance(user.role);
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const overdue =
    lead.nextActionAt && lead.nextActionAt.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-10">
      <Link
        href="/admin/crm/leads"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        Все лиды
      </Link>

      <header className="border-b border-border pb-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <span className="label">{lead.company ? fullName : "Лид"}</span>
            <h1 className="display-3 mt-3">{lead.company ?? fullName}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StageBadge stage={lead.stage} />
              <span className="text-sm text-muted-foreground">
                {lead.service ?? "услуга не указана"}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2">
            {lead.clientId ? (
              <Link
                href="/admin/crm/clients"
                className="text-[0.9375rem] font-medium text-primary"
              >
                Клиент создан →
              </Link>
            ) : (
              <ActionButton
                action={convertLeadAction.bind(null, lead.id)}
                variant="primary"
                confirm="Перевести лид в клиенты? Статус станет WON."
              >
                Перевести в клиенты
              </ActionButton>
            )}
          </div>
        </div>

        <div className="mt-8">
          <p className="label mb-3">Этап</p>
          <StagePicker leadId={lead.id} stage={lead.stage} />
        </div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-12">
          {/* Next action — the thing that stops leads being forgotten. */}
          <section>
            <h2 className="label border-b border-border pb-3">Следующее действие</h2>
            <div className="mt-5">
              {lead.nextActionTitle ? (
                <p className="text-lg tracking-[-0.02em]">
                  {lead.nextActionTitle}
                  <span className={overdue ? "ml-3 text-sm text-destructive" : "ml-3 text-sm text-muted-foreground"}>
                    {formatDate(lead.nextActionAt)}
                    {overdue ? " · просрочено" : ""}
                  </span>
                </p>
              ) : (
                <p className="text-[0.9375rem] text-muted-foreground">
                  Не назначено — назначьте, чтобы лид не потерялся.
                </p>
              )}

              <div className="mt-5 max-w-lg">
                <ActionForm
                  action={setNextActionAction.bind(null, lead.id)}
                  submitLabel="Назначить"
                  pendingLabel="Сохраняем…"
                  resetOnSuccess={false}
                >
                  <FieldRow>
                    <Field
                      label="Что сделать" name="nextActionTitle"
                      defaultValue={lead.nextActionTitle} placeholder="Позвонить"
                    />
                    <Field
                      label="Когда" name="nextActionAt" type="date"
                      defaultValue={lead.nextActionAt?.slice(0, 10)}
                    />
                  </FieldRow>
                </ActionForm>
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h2 className="label border-b border-border pb-3">История</h2>

            <div className="mt-5 max-w-lg">
              <ActionForm
                action={addActivityAction.bind(null, lead.id)}
                submitLabel="Записать"
                pendingLabel="Записываем…"
              >
                <FieldRow>
                  <SelectField
                    label="Что было" name="kind" defaultValue="CALL"
                    options={MANUAL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
                  />
                  <Field label="Кратко" name="summary" placeholder="Обсудили редизайн" />
                </FieldRow>
                <TextField label="Подробнее" name="detail" rows={2} />
              </ActionForm>
            </div>

            {timeline.length === 0 ? (
              <p className="mt-8 text-[0.9375rem] text-muted-foreground">
                Пока ничего не записано.
              </p>
            ) : (
              <ol className="mt-8 border-t border-border">
                {timeline.map((entry) => (
                  <li key={entry.id} className="grid gap-1 border-b border-border py-4 sm:grid-cols-12 sm:gap-4">
                    <div className="num text-subtle-foreground sm:col-span-3">
                      {formatDateTime(entry.createdAt)}
                    </div>
                    <div className="sm:col-span-9">
                      <p className="text-[0.9375rem]">
                        <span className="label mr-2 inline">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                        {entry.summary}
                      </p>
                      {entry.detail ? (
                        <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-subtle-foreground">{entry.actorName}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-10">
          <section>
            <h2 className="label border-b border-border pb-3">Контакты</h2>
            <div className="mt-2">
              <Row label="Имя" value={fullName} />
              <Row label="Должность" value={lead.position} />
              <Row label="Телефон" value={lead.phone} />
              <Row label="Email" value={lead.email} />
              <Row label="Telegram" value={lead.telegram} />
              <Row label="Город" value={lead.city} />
              <Row label="Откуда" value={SOURCE_LABEL[lead.source] ?? lead.source} />
            </div>
          </section>

          <section>
            <h2 className="label border-b border-border pb-3">Проект</h2>
            <div className="mt-2">
              <Row label="Услуга" value={lead.service} />
              <Row label="Сроки" value={lead.timeline} />
              <Row label="Приоритет" value={PRIORITY_LABEL[lead.priority]} />
              {showMoney ? (
                <>
                  <Row label="Бюджет" value={formatMoney(lead.budget)} />
                  <Row label="Наша цена" value={formatMoney(lead.proposedPrice)} />
                </>
              ) : null}
              <Row label="Создан" value={formatDate(lead.createdAt)} />
            </div>
          </section>

          <section>
            <h2 className="label border-b border-border pb-3">Редактировать</h2>
            <div className="mt-5">
              <ActionForm
                action={updateLeadAction.bind(null, lead.id)}
                resetOnSuccess={false}
              >
                <Field label="Компания" name="company" defaultValue={lead.company} />
                <Field label="Телефон" name="phone" defaultValue={lead.phone} />
                <Field label="Email" name="email" defaultValue={lead.email} />
                <Field label="Telegram" name="telegram" defaultValue={lead.telegram} />
                <Field label="Услуга" name="service" defaultValue={lead.service} />
                <TextField label="Что нужно" name="description" defaultValue={lead.description} rows={3} />
                {showMoney ? (
                  <FieldRow>
                    <Field label="Бюджет" name="budget" defaultValue={lead.budget?.amount ? String(lead.budget.amount) : ""} />
                    <Field label="Наша цена" name="proposedPrice" defaultValue={lead.proposedPrice?.amount ? String(lead.proposedPrice.amount) : ""} />
                  </FieldRow>
                ) : null}
                <SelectField
                  label="Валюта" name="currency"
                  defaultValue={lead.budget?.currency ?? DEFAULT_CURRENCY}
                  options={CURRENCY_OPTIONS}
                />
                <SelectField
                  label="Приоритет" name="priority" defaultValue={lead.priority}
                  options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                />
                <TextField label="Заметки" name="notes" defaultValue={lead.notes} rows={2} />
              </ActionForm>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
