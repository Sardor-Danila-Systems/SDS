import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Pin } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import {
  carryOverTasks,
  getStandup,
  tasksOfStandup,
} from "@/lib/crm/standups";
import { PRIORITIES } from "@/types/crm";
import {
  PRIORITY_LABEL, Panel, PriorityTag, formatDate, formatDateTime,
} from "@/components/crm/ui";
import { ActionButton, ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { TaskStatusPicker } from "@/components/crm/task-status";
import { AttendanceTable } from "@/components/standups/attendance-table";
import {
  REASON_LABEL,
  STANDUP_STATUS_LABEL,
  STATUS_LABEL,
  formatStandupDate,
} from "@/components/standups/shared";
import { taskKey } from "@/components/tracker/shared";
import { cn } from "@/lib/utils";
import {
  addGuestAction,
  cancelStandupAction,
  createStandupTaskAction,
  deleteStandupAction,
  rescheduleStandupAction,
  restoreStandupAction,
  saveNotesAction,
  saveSummaryAction,
} from "../actions";

export default async function StandupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "standup.manage")) redirect("/admin");
  const { id } = await params;

  let standup, carry, tasks;
  try {
    standup = await getStandup(id);
    if (!standup) notFound();
    [carry, tasks] = await Promise.all([carryOverTasks(id), tasksOfStandup(id)]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const people = await listAssignableUsers();
  const nameOf = (userId?: string) => people.find((p) => p.id === userId)?.name ?? "—";

  const cancelled = standup.status === "CANCELLED";
  const absent = standup.attendance.filter((a) =>
    ["ABSENT", "WARNED", "EXCUSED", "LATE"].includes(a.status),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/admin/standups"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        К созвонам
      </Link>

      <header className="admin-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm tabular text-muted-foreground">
              {formatStandupDate(standup.date)}, {standup.time} · {standup.organizerName}
            </p>
            <h1 className="mt-1 text-[1.625rem] font-semibold leading-tight tracking-[-0.03em]">
              {standup.title}
              {standup.pinned ? <Pin className="ml-2 inline size-4 text-primary" aria-label="Закреплён" /> : null}
            </h1>
            <p className="mt-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  standup.status === "PLANNED" && "bg-primary-soft text-primary",
                  standup.status === "HELD" && "bg-[var(--success-soft)] text-[var(--success)]",
                  cancelled && "bg-surface text-subtle-foreground",
                )}
              >
                {STANDUP_STATUS_LABEL[standup.status]}
              </span>
              {cancelled && standup.cancelReason ? (
                <span className="ml-3 text-sm text-muted-foreground">Причина: {standup.cancelReason}</span>
              ) : null}
            </p>
          </div>
          {standup.link ? (
            <a
              href={standup.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-panel)] transition-colors hover:bg-primary-hover"
            >
              Открыть созвон <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-4">
          {cancelled ? (
            <ActionButton action={restoreStandupAction.bind(null, standup.id)}>Вернуть в план</ActionButton>
          ) : (
            <>
              <details>
                <summary className="cursor-pointer list-none text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Перенести
                </summary>
                <div className="mt-3 max-w-md">
                  <ActionForm
                    action={rescheduleStandupAction.bind(null, standup.id)}
                    submitLabel="Перенести"
                    pendingLabel="Переносим…"
                  >
                    <FieldRow>
                      <Field label="Новая дата" name="date" type="date" required defaultValue={standup.date} />
                      <Field label="Время" name="time" type="time" required defaultValue={standup.time} />
                    </FieldRow>
                    <Field label="Причина переноса" name="reason" placeholder="Необязательно" />
                  </ActionForm>
                </div>
              </details>
              <details>
                <summary className="cursor-pointer list-none text-sm text-muted-foreground transition-colors hover:text-destructive">
                  Отменить
                </summary>
                <div className="mt-3 max-w-md">
                  <ActionForm
                    action={cancelStandupAction.bind(null, standup.id)}
                    submitLabel="Отменить созвон"
                    pendingLabel="Отменяем…"
                  >
                    <Field label="Причина отмены" name="reason" placeholder="Необязательно" />
                  </ActionForm>
                </div>
              </details>
            </>
          )}
          <ActionButton
            action={deleteStandupAction.bind(null, standup.id)}
            confirm="Удалить созвон? Он пропадёт из списка и статистики."
          >
            Удалить
          </ActionButton>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Panel title="Посещаемость" flush>
            <AttendanceTable
              standupId={standup.id}
              entries={standup.attendance}
              editable={!cancelled}
            />
            {!cancelled ? (
              <div className="border-t border-border px-5 py-4">
                <p className="label mb-2">Добавить гостя</p>
                <ActionForm
                  action={addGuestAction.bind(null, standup.id)}
                  submitLabel="Добавить"
                  pendingLabel="Добавляем…"
                >
                  <Field label="Имя" name="name" placeholder="Человека, которого нет в системе" />
                </ActionForm>
              </div>
            ) : null}
          </Panel>

          <Panel title="Тема, повестка и заметки">
            <ActionForm
              action={saveNotesAction.bind(null, standup.id)}
              submitLabel="Сохранить"
              pendingLabel="Сохраняем…"
              resetOnSuccess={false}
            >
              <Field label="Тема" name="title" required defaultValue={standup.title} />
              <Field label="Ссылка на созвон" name="link" defaultValue={standup.link} placeholder="Google Meet, Discord…" />
              <TextField label="Повестка" name="agenda" rows={4} defaultValue={standup.agenda} />
              <TextField label="Заметки по ходу созвона" name="notes" rows={6} defaultValue={standup.notes} />
            </ActionForm>
          </Panel>

          <Panel title="Итоги" description="Решения, проблемы, важные замечания и следующие шаги">
            <ActionForm
              action={saveSummaryAction.bind(null, standup.id)}
              submitLabel="Сохранить итоги"
              pendingLabel="Сохраняем…"
              resetOnSuccess={false}
            >
              <TextField label="Итоги созвона" name="summary" rows={6} defaultValue={standup.summary} />
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" name="pinned" defaultChecked={standup.pinned} className="size-4 accent-[var(--primary)]" />
                Закрепить итоги в начале раздела
              </label>
              {standup.status === "PLANNED" ? (
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" name="finish" defaultChecked className="size-4 accent-[var(--primary)]" />
                  Отметить созвон проведённым
                </label>
              ) : null}
            </ActionForm>
          </Panel>
        </div>

        <aside className="space-y-6">
          {absent.length > 0 ? (
            <Panel title="Отсутствовали и опоздали" flush>
              <ul className="divide-y divide-border">
                {absent.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_LABEL[a.status]}
                      {a.reason ? ` · ${REASON_LABEL[a.reason]}` : ""}
                      {a.reasonText ? ` · ${a.reasonText}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel
            title={`Не закрыто с прошлых созвонов · ${carry.length}`}
            description="Спросите, что с этими задачами"
            flush
          >
            {carry.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Всё закрыто.</p>
            ) : (
              <ul className="divide-y divide-border">
                {carry.map(({ task, from }) => (
                  <li key={task.id} className="space-y-2 px-5 py-3.5">
                    <Link href={`/admin/tracker/${task.id}`} className="block text-sm font-medium hover:text-primary">
                      <span className="mr-2 text-xs tabular text-muted-foreground">{taskKey(task.number ?? 0)}</span>
                      {task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {nameOf(task.ownerId)} · с созвона {formatStandupDate(from.date)}
                      {task.dueAt ? ` · срок ${formatDate(task.dueAt)}` : ""}
                    </p>
                    <TaskStatusPicker taskId={task.id} status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Задачи после созвона · ${tasks.length}`} flush>
            {tasks.length > 0 ? (
              <ul className="divide-y divide-border">
                {tasks.map((task) => (
                  <li key={task.id} className="space-y-2 px-5 py-3.5">
                    <Link href={`/admin/tracker/${task.id}`} className="block text-sm font-medium hover:text-primary">
                      <span className="mr-2 text-xs tabular text-muted-foreground">{taskKey(task.number ?? 0)}</span>
                      {task.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{nameOf(task.ownerId)}</span>
                      <PriorityTag priority={task.priority} />
                      {task.dueAt ? <span>срок {formatDate(task.dueAt)}</span> : null}
                    </p>
                    <TaskStatusPicker taskId={task.id} status={task.status} />
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={cn("px-5 py-4", tasks.length > 0 && "border-t border-border")}>
              <p className="label mb-3">Новая задача</p>
              <ActionForm
                action={createStandupTaskAction.bind(null, standup.id)}
                submitLabel="Поставить задачу"
                pendingLabel="Создаём…"
              >
                <Field label="Что сделать" name="title" required placeholder="Подготовить отчёт по лидам" />
                <SelectField
                  label="Ответственный" name="ownerId" defaultValue={user.id}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                />
                <FieldRow>
                  <Field label="Срок" name="dueAt" type="date" />
                  <SelectField
                    label="Приоритет" name="priority" defaultValue="MEDIUM"
                    options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                  />
                </FieldRow>
                <TextField label="Описание" name="description" rows={2} />
              </ActionForm>
            </div>
          </Panel>

          <Panel title="История изменений" flush>
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {standup.history.map((h) => (
                <li key={h.id} className="px-5 py-3 text-sm">
                  <p>{h.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {h.actorName} · {formatDateTime(h.at)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
