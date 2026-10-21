import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthzError, listLeads, listMeetings } from "@/lib/crm/repo";
import { MEETING_TYPES } from "@/types/crm";
import { EmptyState, Panel, PageHeader, formatDateTime } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { addMeetingAction } from "../actions";

const TYPE_LABEL: Record<string, string> = {
  CALL: "Звонок", VIDEO: "Видеозвонок", MEETING: "Встреча", OTHER: "Другое",
};

export default async function MeetingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let meetings, leads;
  try {
    [meetings, leads] = await Promise.all([listMeetings(), listLeads()]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const now = new Date().toISOString();
  const upcoming = meetings.filter((m) => m.startAt >= now);
  const past = meetings.filter((m) => m.startAt < now).reverse();

  const leadName = (id?: string) => {
    const lead = leads.find((l) => l.id === id);
    return lead ? (lead.company ?? `${lead.firstName} ${lead.lastName ?? ""}`.trim()) : null;
  };

  return (
    <div className="space-y-6">
      <PageHeader label="Продажи" title="Встречи" hint={`${upcoming.length} впереди`} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {meetings.length === 0 ? (
            <EmptyState title="Встреч пока нет" hint="Запланируйте первую — она появится на дашборде в день встречи." />
          ) : (
            <>
              <Panel flush title="Ближайшие">
                {upcoming.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground">Ничего не запланировано.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {upcoming.map((m) => (
                      <li key={m.id} className="grid gap-2 px-5 py-4 sm:grid-cols-12 sm:gap-4">
                        <span className="text-sm tabular text-muted-foreground sm:col-span-3">{formatDateTime(m.startAt)}</span>
                        <div className="sm:col-span-9">
                          <p className="text-sm font-medium">
                            <span className="mr-2 inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{TYPE_LABEL[m.type] ?? m.type}</span>
                            {m.title}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-subtle-foreground">
                            {m.location ? <span>{m.location}</span> : null}
                            {m.entityId && leadName(m.entityId) ? (
                              <Link href={`/admin/crm/leads/${m.entityId}`} className="hover:text-foreground">
                                {leadName(m.entityId)}
                              </Link>
                            ) : null}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {past.length > 0 ? (
                <Panel flush title="Прошедшие">
                  <ul className="divide-y divide-border">
                    {past.slice(0, 10).map((m) => (
                      <li key={m.id} className="grid gap-2 px-5 py-3.5 text-muted-foreground sm:grid-cols-12 sm:gap-4">
                        <span className="text-sm tabular sm:col-span-3">{formatDateTime(m.startAt)}</span>
                        <span className="text-sm sm:col-span-9">{m.title}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-20">
          <Panel title="Запланировать">
          <div>
            <ActionForm action={addMeetingAction} submitLabel="Запланировать" pendingLabel="Сохраняем…">
              <Field label="Тема" name="title" required placeholder="Демо CRM" />
              <FieldRow>
                <Field label="Дата" name="date" type="date" required />
                <Field label="Время" name="time" type="time" defaultValue="10:00" />
              </FieldRow>
              <SelectField
                label="Формат" name="type" defaultValue="CALL"
                options={MEETING_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))}
              />
              <Field label="Место или ссылка" name="location" placeholder="Google Meet" />
              <SelectField
                label="Лид" name="entityId" defaultValue=""
                options={[
                  { value: "", label: "— без связи —" },
                  ...leads.map((l) => ({
                    value: l.id,
                    label: l.company ?? `${l.firstName} ${l.lastName ?? ""}`.trim(),
                  })),
                ]}
              />
              <TextField label="Заметки" name="description" rows={2} />
            </ActionForm>
          </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
