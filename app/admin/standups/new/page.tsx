import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { DEFAULT_AGENDA, getSchedule, wallNow } from "@/lib/crm/standups";
import { PageHeader, Panel } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, TextField } from "@/components/crm/fields";
import { TemplateButton } from "@/components/standups/template-button";
import { createStandupAction } from "../actions";

export default async function NewStandupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "standup.manage")) redirect("/admin");

  const schedule = await getSchedule();
  const { date } = wallNow();

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/admin/standups"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К созвонам
      </Link>
      <PageHeader title="Новый созвон" hint="Участники подтянутся автоматически — команду можно отмечать сразу" />

      <Panel>
        <ActionForm
          action={createStandupAction}
          submitLabel="Создать созвон"
          pendingLabel="Создаём…"
          resetOnSuccess={false}
        >
          <Field label="Тема" name="title" required defaultValue={schedule.title} placeholder="Обсуждение прогресса проекта" />
          <FieldRow>
            <Field label="Дата" name="date" type="date" required defaultValue={date} />
            <Field label="Время" name="time" type="time" defaultValue={schedule.time} />
          </FieldRow>
          <Field label="Ссылка на созвон" name="link" defaultValue={schedule.link} placeholder="Google Meet, Discord…" />
          <div>
            <TextField label="Повестка" name="agenda" rows={5} defaultValue={schedule.agenda || DEFAULT_AGENDA} />
            <div className="mt-1.5">
              <TemplateButton field="agenda" template={DEFAULT_AGENDA} label="Шаблон: вчера / сегодня / блокеры" />
            </div>
          </div>
        </ActionForm>
      </Panel>
    </div>
  );
}
