import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarCheck, Pin, Plus, Video } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import {
  DEFAULT_AGENDA,
  ensureSchedule,
  getSchedule,
  listStandups,
  wallNow,
} from "@/lib/crm/standups";
import { EmptyState, PageHeader, Panel, PrimaryAction } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, TextField } from "@/components/crm/fields";
import { TemplateButton } from "@/components/standups/template-button";
import {
  REASON_LABEL,
  STANDUP_STATUS_LABEL,
  STATUS_LABEL,
  WEEKDAYS,
  formatStandupDate,
} from "@/components/standups/shared";
import { cn } from "@/lib/utils";
import type { Standup } from "@/types/crm";
import { saveScheduleAction } from "./actions";

const STATUS_PILL: Record<Standup["status"], string> = {
  PLANNED: "bg-primary-soft text-primary",
  HELD: "bg-[var(--success-soft)] text-[var(--success)]",
  CANCELLED: "bg-surface text-subtle-foreground",
};

function counts(standup: Standup) {
  const people = standup.attendance;
  const came = people.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  return { came, total: people.length };
}

function Row({ standup }: { standup: Standup }) {
  const { came, total } = counts(standup);
  return (
    <li>
      <Link
        href={`/admin/standups/${standup.id}`}
        className="group grid gap-1 px-5 py-3.5 transition-colors hover:bg-surface/60 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-4"
      >
        <span className="text-sm tabular text-muted-foreground">
          {formatStandupDate(standup.date)}, {standup.time}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium group-hover:text-primary">
            {standup.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {standup.organizerName}
            {standup.pinned ? " · закреплён" : ""}
          </span>
        </span>
        <span className="flex items-center gap-3">
          {standup.status !== "CANCELLED" ? (
            <span className="text-xs tabular text-muted-foreground">
              {came}/{total}
            </span>
          ) : null}
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_PILL[standup.status])}>
            {STANDUP_STATUS_LABEL[standup.status]}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function StandupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "standup.manage")) redirect("/admin");

  let standups, schedule;
  try {
    await ensureSchedule();
    [standups, schedule] = await Promise.all([listStandups(), getSchedule()]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const today = wallNow().date;
  const upcoming = standups
    .filter((s) => s.date >= today && s.status !== "HELD")
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const past = standups.filter((s) => !upcoming.includes(s));
  const pinned = standups.filter((s) => s.pinned && s.summary.trim());

  // Who was missing from the latest call that has been filled in.
  const lastMarked = past.find(
    (s) => s.status !== "CANCELLED" && s.attendance.some((a) => a.status !== "UNMARKED"),
  );
  const missing =
    lastMarked?.attendance.filter((a) =>
      ["ABSENT", "WARNED", "EXCUSED", "LATE"].includes(a.status),
    ) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Созвоны"
        hint="Дэйлики: кто был, о чём говорили, что решили"
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/standups/stats"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface"
            >
              <BarChart3 className="size-4" /> Статистика
            </Link>
            <PrimaryAction href="/admin/standups/new">
              <Plus className="size-4" /> Новый созвон
            </PrimaryAction>
          </div>
        }
      />

      {pinned.length > 0 ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Pin className="size-3.5" /> Закреплённые итоги
            </span>
          }
          flush
        >
          <ul className="divide-y divide-border">
            {pinned.slice(0, 4).map((s) => (
              <li key={s.id}>
                <Link href={`/admin/standups/${s.id}`} className="block px-5 py-3.5 transition-colors hover:bg-surface/60">
                  <p className="text-xs text-muted-foreground">
                    {formatStandupDate(s.date)} · {s.title}
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{s.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {standups.length === 0 ? (
            <EmptyState
              icon={Video}
              title="Созвонов пока нет"
              hint="Создайте первый или включите расписание справа — созвоны будут появляться сами."
              action={<PrimaryAction href="/admin/standups/new">Новый созвон</PrimaryAction>}
            />
          ) : (
            <>
              <Panel title="Ближайшие" flush>
                {upcoming.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground">Ничего не запланировано.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {upcoming.map((s) => (
                      <Row key={s.id} standup={s} />
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="История" description={`${past.length} созвонов`} flush>
                {past.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground">Прошедших созвонов пока нет.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {past.map((s) => (
                      <Row key={s.id} standup={s} />
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20">
          <Panel
            title="Не было на последнем созвоне"
            description={lastMarked ? `${formatStandupDate(lastMarked.date)} · ${lastMarked.title}` : undefined}
            flush
          >
            {!lastMarked ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Пока нет отмеченных созвонов.</p>
            ) : missing.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Все были вовремя.</p>
            ) : (
              <ul className="divide-y divide-border">
                {missing.map((a) => (
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
            )}
          </Panel>

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarCheck className="size-3.5" /> Расписание
              </span>
            }
            description={schedule.enabled ? "Созвоны создаются автоматически" : "Выключено"}
          >
            <ActionForm
              action={saveScheduleAction}
              submitLabel="Сохранить расписание"
              pendingLabel="Сохраняем…"
              resetOnSuccess={false}
            >
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={schedule.enabled}
                  className="size-4 accent-[var(--primary)]"
                />
                Создавать созвоны автоматически
              </label>
              <fieldset className="space-y-1.5">
                <legend className="label">Дни недели</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <label
                      key={d.value}
                      className="inline-flex h-9 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-2.5 text-sm has-[:checked]:border-transparent has-[:checked]:bg-primary-soft has-[:checked]:font-medium has-[:checked]:text-primary"
                    >
                      <input
                        type="checkbox"
                        name="days"
                        value={d.value}
                        defaultChecked={schedule.days.includes(d.value)}
                        className="sr-only"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <FieldRow>
                <Field label="Время" name="time" type="time" defaultValue={schedule.time} />
                <Field label="Тема" name="title" defaultValue={schedule.title} />
              </FieldRow>
              <Field label="Ссылка на созвон" name="link" defaultValue={schedule.link} placeholder="https://meet.google.com/…" />
              <div>
                <TextField label="Повестка по умолчанию" name="agenda" rows={4} defaultValue={schedule.agenda} />
                <div className="mt-1.5">
                  <TemplateButton field="agenda" template={DEFAULT_AGENDA} label="Шаблон: вчера / сегодня / блокеры" />
                </div>
              </div>
            </ActionForm>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
