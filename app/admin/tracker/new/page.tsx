import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, listProjects } from "@/lib/crm/repo";
import { PRIORITIES } from "@/types/crm";
import { PageHeader, Panel, PRIORITY_LABEL } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { DEPARTMENT_LABEL, departmentOf } from "@/components/tracker/shared";
import { createTrackerTaskAction } from "../../crm/actions";

export default async function NewTaskPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let projects;
  try {
    projects = await listProjects();
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const isAdmin = can(user.role, "task.assign");
  const people = isAdmin ? await listAssignableUsers() : [];

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/admin/tracker"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К доске
      </Link>
      <PageHeader title="Новая задача" />

      <Panel>
        <ActionForm
          action={createTrackerTaskAction}
          submitLabel="Создать задачу"
          pendingLabel="Создаём…"
          resetOnSuccess={false}
        >
          <Field label="Название" name="title" required placeholder="Сделать экспорт лидов в Excel" />
          <TextField label="Описание" name="description" rows={4} />
          {isAdmin ? (
            <SelectField
              label="Исполнитель" name="ownerId" defaultValue={user.id}
              options={people.map((p) => ({
                value: p.id,
                label: `${p.name} · ${DEPARTMENT_LABEL[departmentOf(p.role)]}`,
              }))}
            />
          ) : null}
          <FieldRow>
            <SelectField
              label="Приоритет" name="priority" defaultValue="MEDIUM"
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            />
            <Field label="Срок" name="dueAt" type="date" />
          </FieldRow>
          <SelectField
            label="Проект клиента" name="projectId" defaultValue=""
            options={[
              { value: "", label: "— без проекта —" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </ActionForm>
      </Panel>
    </div>
  );
}
