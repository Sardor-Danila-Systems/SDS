import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, activitiesFor, getTask, listProjects } from "@/lib/crm/repo";
import { PRIORITIES } from "@/types/crm";
import {
  Panel, PRIORITY_LABEL, PriorityTag, formatDate, formatDateTime,
} from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { TaskStatusPicker } from "@/components/crm/task-status";
import {
  DEPARTMENT_LABEL, departmentOf, initials, isOverdue, taskKey,
} from "@/components/tracker/shared";
import { commentTaskAction, editTaskAction } from "../../crm/actions";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const { id } = await params;

  let task, projects, history;
  try {
    task = await getTask(id);
    if (!task) notFound();
    [projects, history] = await Promise.all([listProjects(), activitiesFor("task", id)]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const isAdmin = can(user.role, "task.assign");
  const people = await listAssignableUsers();
  const owner = people.find((p) => p.id === task.ownerId);
  const project = projects.find((p) => p.id === task.projectId);
  const comments = task.comments ?? [];
  const overdue = isOverdue(task);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/tracker"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К доске
      </Link>

      <header className="admin-panel p-6">
        <p className="text-sm tabular text-muted-foreground">{taskKey(task.number ?? 0)}</p>
        <h1 className="mt-1 text-[1.625rem] font-semibold leading-tight tracking-[-0.03em]">
          {task.title}
        </h1>
        <div className="mt-5 border-t border-border pt-5">
          <p className="label mb-3">Статус</p>
          <TaskStatusPicker taskId={task.id} status={task.status} />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {task.description ? (
            <Panel title="Описание">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
            </Panel>
          ) : null}

          <Panel title={`Комментарии · ${comments.length}`}>
            {comments.length > 0 ? (
              <ul className="mb-6 space-y-4">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {initials(c.authorName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{c.authorName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm
              action={commentTaskAction.bind(null, task.id)}
              submitLabel="Отправить"
              pendingLabel="Отправляем…"
            >
              <TextField label="Новый комментарий" name="text" rows={3} placeholder="Что сделано, что мешает, вопрос к исполнителю" />
            </ActionForm>
          </Panel>

          <Panel title="История" flush>
            {history.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Пока пусто.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <p>{entry.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actorName} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20">
          <Panel title="Детали">
            <div className="-my-3">
              <Row label="Исполнитель">
                <span className="inline-flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-[0.625rem] font-semibold text-primary">
                    {initials(owner?.name ?? "?")}
                  </span>
                  {owner?.name ?? "Не назначен"}
                </span>
              </Row>
              <Row label="Отдел">{DEPARTMENT_LABEL[departmentOf(owner?.role)]}</Row>
              <Row label="Приоритет"><PriorityTag priority={task.priority} /></Row>
              <Row label="Срок">
                <span className={overdue ? "font-medium text-destructive" : ""}>
                  {task.dueAt ? formatDate(task.dueAt) : "—"}
                  {overdue ? " · просрочено" : ""}
                </span>
              </Row>
              <Row label="Проект">{project?.name ?? "—"}</Row>
              <Row label="Автор">{task.createdByName ?? "—"}</Row>
              <Row label="Создана">{formatDate(task.createdAt)}</Row>
            </div>
          </Panel>

          <Panel title="Редактировать">
            <ActionForm
              action={editTaskAction.bind(null, task.id)}
              submitLabel="Сохранить"
              pendingLabel="Сохраняем…"
              resetOnSuccess={false}
            >
              <Field label="Название" name="title" required defaultValue={task.title} />
              <TextField label="Описание" name="description" rows={3} defaultValue={task.description} />
              {isAdmin ? (
                <SelectField
                  label="Исполнитель" name="ownerId" defaultValue={task.ownerId ?? ""}
                  options={people.map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${DEPARTMENT_LABEL[departmentOf(p.role)]}`,
                  }))}
                />
              ) : null}
              <FieldRow>
                <SelectField
                  label="Приоритет" name="priority" defaultValue={task.priority}
                  options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                />
                <Field label="Срок" name="dueAt" type="date" defaultValue={task.dueAt?.slice(0, 10)} />
              </FieldRow>
              <SelectField
                label="Проект клиента" name="projectId" defaultValue={task.projectId ?? ""}
                options={[
                  { value: "", label: "— без проекта —" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </ActionForm>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
