import "server-only";
import { requirePermission, createTask, listTasks } from "./repo";
import { mutateCrm, readCrm } from "./store";
import type {
  AbsenceReason,
  Attendance,
  AttendanceStatus,
  CrmData,
  Priority,
  Standup,
  StandupSchedule,
} from "@/types/crm";
import { ABSENCE_REASONS, ATTENDANCE_STATUSES } from "@/types/crm";
import { STATUS_LABEL } from "@/components/standups/shared";

/*
  The "Созвоны" section: calls, who was on them, what came out of them.

  Everything here is admin-only. Absence reasons are personal data, and the
  section as a whole is how the owner follows the team's discipline — it is not
  something a team member needs to read about their colleagues.
*/

const TIME_ZONE = "Asia/Tashkent";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const alive = <T extends { deletedAt?: string }>(rows: T[]) =>
  rows.filter((row) => !row.deletedAt);

/* ---------------------------------- time ---------------------------------- */

/** "Now" on the team's wall clock, as the same strings a standup stores. */
export function wallNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const sortKey = (s: Pick<Standup, "date" | "time">) => `${s.date} ${s.time}`;

/* ------------------------------- participants ----------------------------- */

function participants(data: CrmData) {
  return [
    { userId: "bootstrap-admin", name: "Администратор" },
    ...data.users
      .filter((u) => u.active)
      .map((u) => ({ userId: u.id, name: u.name })),
  ];
}

function entryFor(person: { userId: string; name: string }): Attendance {
  return { id: id(), userId: person.userId, name: person.name, status: "UNMARKED" };
}

/** Adds anyone who joined the team since the call was created. */
function syncParticipants(data: CrmData, standup: Standup) {
  let added = false;
  for (const person of participants(data)) {
    if (!standup.attendance.some((a) => a.userId === person.userId)) {
      standup.attendance.push(entryFor(person));
      added = true;
    }
  }
  return added;
}

function change(standup: Standup, actorName: string, summary: string) {
  standup.history.unshift({ id: id(), at: now(), actorName, summary });
  standup.updatedAt = now();
}

/* ---------------------------------- reads --------------------------------- */

export async function listStandups() {
  await requirePermission("standup.manage");
  // Not the request-scoped copy `getCrm` hands out: the layout reads that one
  // before this page can create the day's calls, and it would never see them.
  const { standups } = await readCrm();
  return alive(standups ?? []).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

export async function getStandup(standupId: string) {
  return (await listStandups()).find((s) => s.id === standupId) ?? null;
}

export async function getSchedule(): Promise<StandupSchedule> {
  await requirePermission("standup.manage");
  const { standupSchedule } = await readCrm();
  return (
    standupSchedule ?? {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      time: "10:00",
      title: "Дэйли",
      agenda: DEFAULT_AGENDA,
    }
  );
}

export const DEFAULT_AGENDA =
  "Что сделал вчера?\nЧто планирую сегодня?\nКакие есть блокеры?";

/* --------------------------------- mutations ------------------------------ */

export async function createStandup(input: {
  title: string;
  date: string;
  time: string;
  link?: string;
  agenda?: string;
}) {
  const actor = await requirePermission("standup.manage");
  if (!input.title.trim()) throw new Error("Укажите тему созвона.");

  return mutateCrm((data) => {
    const standup: Standup = {
      id: id(),
      title: input.title.trim(),
      date: input.date,
      time: input.time,
      link: input.link,
      status: "PLANNED",
      agenda: input.agenda ?? DEFAULT_AGENDA,
      notes: "",
      summary: "",
      pinned: false,
      organizerId: actor.id,
      organizerName: actor.name,
      attendance: participants(data).map(entryFor),
      history: [],
      createdAt: now(),
      updatedAt: now(),
    };
    change(standup, actor.name, "Созвон создан");
    data.standups = [...(data.standups ?? []), standup];
    return standup;
  });
}

async function withStandup<T>(
  standupId: string,
  work: (standup: Standup, data: CrmData, actorName: string) => T,
) {
  const actor = await requirePermission("standup.manage");
  return mutateCrm((data) => {
    const standup = (data.standups ?? []).find((s) => s.id === standupId && !s.deletedAt);
    if (!standup) throw new Error("Созвон не найден.");
    return work(standup, data, actor.name);
  });
}

export function updateStandupText(
  standupId: string,
  patch: { title?: string; link?: string; agenda?: string; notes?: string },
) {
  return withStandup(standupId, (standup, _data, actor) => {
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error("Тема не может быть пустой.");
      if (patch.title.trim() !== standup.title) {
        change(standup, actor, `Тема: «${standup.title}» → «${patch.title.trim()}»`);
      }
      standup.title = patch.title.trim();
    }
    if ("link" in patch) standup.link = patch.link || undefined;
    if (patch.agenda !== undefined) standup.agenda = patch.agenda;
    if (patch.notes !== undefined) standup.notes = patch.notes;
    standup.updatedAt = now();
    return standup;
  });
}

export function saveSummary(
  standupId: string,
  input: { summary: string; pinned: boolean; finish: boolean },
) {
  return withStandup(standupId, (standup, _data, actor) => {
    standup.summary = input.summary;
    standup.pinned = input.pinned;
    if (input.finish && standup.status !== "HELD") {
      standup.status = "HELD";
      change(standup, actor, "Созвон завершён, итоги сохранены");
    } else {
      change(standup, actor, "Итоги обновлены");
    }
    return standup;
  });
}

export function cancelStandup(standupId: string, reason: string) {
  return withStandup(standupId, (standup, _data, actor) => {
    standup.status = "CANCELLED";
    standup.cancelReason = reason || undefined;
    change(standup, actor, `Созвон отменён${reason ? `: ${reason}` : ""}`);
    return standup;
  });
}

export function restoreStandup(standupId: string) {
  return withStandup(standupId, (standup, _data, actor) => {
    standup.status = "PLANNED";
    standup.cancelReason = undefined;
    change(standup, actor, "Созвон возвращён в план");
    return standup;
  });
}

export function rescheduleStandup(
  standupId: string,
  input: { date: string; time: string; reason: string },
) {
  return withStandup(standupId, (standup, _data, actor) => {
    const from = `${standup.date} ${standup.time}`;
    standup.date = input.date;
    standup.time = input.time;
    change(
      standup,
      actor,
      `Перенос: ${from} → ${input.date} ${input.time}${input.reason ? ` (${input.reason})` : ""}`,
    );
    return standup;
  });
}

export function deleteStandup(standupId: string) {
  return withStandup(standupId, (standup, _data, actor) => {
    standup.deletedAt = now();
    change(standup, actor, "Созвон удалён");
    return standup;
  });
}

export function setAttendance(
  standupId: string,
  entryId: string,
  input: { status: AttendanceStatus; reason?: AbsenceReason; reasonText?: string },
) {
  if (!ATTENDANCE_STATUSES.includes(input.status)) throw new Error("Неизвестный статус.");
  if (input.reason && !ABSENCE_REASONS.includes(input.reason)) {
    throw new Error("Неизвестная причина.");
  }
  return withStandup(standupId, (standup, _data, actor) => {
    const entry = standup.attendance.find((a) => a.id === entryId);
    if (!entry) throw new Error("Участник не найден.");

    const before = entry.status;
    const beforeReason = entry.reason ?? entry.reasonText;
    entry.status = input.status;
    // A reason only means something for the statuses that explain an absence.
    const keepsReason = ["ABSENT", "WARNED", "EXCUSED", "LATE"].includes(input.status);
    entry.reason = keepsReason ? input.reason : undefined;
    entry.reasonText = keepsReason ? input.reasonText?.trim() || undefined : undefined;

    const afterReason = entry.reason ?? entry.reasonText;
    if (before !== entry.status) {
      change(
        standup,
        actor,
        `${entry.name}: ${STATUS_LABEL[before]} → ${STATUS_LABEL[entry.status]}`,
      );
    } else if (beforeReason !== afterReason) {
      change(standup, actor, `${entry.name}: причина изменена`);
    }
    return entry;
  });
}

/** Marks everyone not yet marked as present; people already marked stay as they are. */
export function markAllPresent(standupId: string) {
  return withStandup(standupId, (standup, _data, actor) => {
    let count = 0;
    for (const entry of standup.attendance) {
      if (entry.status === "UNMARKED") {
        entry.status = "PRESENT";
        count++;
      }
    }
    if (count > 0) change(standup, actor, `Все присутствовали (отмечено: ${count})`);
    return count;
  });
}

export function addGuest(standupId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите имя гостя.");
  return withStandup(standupId, (standup, _data, actor) => {
    standup.attendance.push({
      id: id(),
      name: trimmed,
      guest: true,
      status: "PRESENT",
    });
    change(standup, actor, `Добавлен гость: ${trimmed}`);
    return standup;
  });
}

export function removeGuest(standupId: string, entryId: string) {
  return withStandup(standupId, (standup, _data, actor) => {
    const entry = standup.attendance.find((a) => a.id === entryId && a.guest);
    if (!entry) throw new Error("Гость не найден.");
    standup.attendance = standup.attendance.filter((a) => a.id !== entryId);
    change(standup, actor, `Гость убран: ${entry.name}`);
    return standup;
  });
}

export async function createStandupTask(
  standupId: string,
  input: {
    title: string;
    ownerId?: string;
    dueAt?: string;
    description?: string;
    priority?: Priority;
  },
) {
  const standup = await getStandup(standupId);
  if (!standup) throw new Error("Созвон не найден.");
  const task = await createTask({ ...input, standupId });
  await withStandup(standupId, (s, _data, actor) => {
    change(s, actor, `Задача после созвона: ${input.title}`);
  });
  return task;
}

/* -------------------------------- schedule -------------------------------- */

export async function saveSchedule(input: StandupSchedule) {
  await requirePermission("standup.manage");
  if (input.enabled && input.days.length === 0) {
    throw new Error("Выберите хотя бы один день недели.");
  }
  return mutateCrm((data) => {
    data.standupSchedule = input;
    return input;
  });
}

const HORIZON_DAYS = 7;

/**
 * Creates the calls the schedule calls for over the next week and brings the
 * participant lists of planned ones up to date. Safe to call on every visit:
 * it writes only when something is actually missing, and a call that was
 * cancelled or deleted is never recreated for that day.
 */
export async function ensureSchedule() {
  await requirePermission("standup.manage");
  const snapshot = await readCrm();
  const schedule = snapshot.standupSchedule;
  const today = wallNow().date;

  const existing = (data: CrmData) => data.standups ?? [];
  const missingDates = schedule?.enabled
    ? Array.from({ length: HORIZON_DAYS + 1 }, (_, i) => addDays(today, i)).filter(
        (date) =>
          schedule.days.includes(isoWeekday(date)) &&
          !existing(snapshot).some((s) => s.auto && s.date === date),
      )
    : [];
  const needsSync = existing(snapshot).some(
    (s) =>
      s.status === "PLANNED" &&
      !s.deletedAt &&
      s.date >= today &&
      participants(snapshot).some((p) => !s.attendance.some((a) => a.userId === p.userId)),
  );
  if (missingDates.length === 0 && !needsSync) return;

  await mutateCrm((data) => {
    data.standups = existing(data);
    const sched = data.standupSchedule;
    if (sched?.enabled) {
      for (const date of missingDates) {
        if (data.standups.some((s) => s.auto && s.date === date)) continue;
        const standup: Standup = {
          id: id(),
          title: sched.title,
          date,
          time: sched.time,
          link: sched.link,
          status: "PLANNED",
          agenda: sched.agenda,
          notes: "",
          summary: "",
          pinned: false,
          organizerId: "bootstrap-admin",
          organizerName: "Администратор",
          attendance: participants(data).map(entryFor),
          history: [],
          auto: true,
          createdAt: now(),
          updatedAt: now(),
        };
        change(standup, "Расписание", "Создан по расписанию");
        data.standups.push(standup);
      }
    }
    for (const standup of data.standups) {
      if (standup.status === "PLANNED" && !standup.deletedAt && standup.date >= today) {
        syncParticipants(data, standup);
      }
    }
  });
}

/* --------------------------- unfinished from before ----------------------- */

/** Open tasks that came out of earlier calls — what to ask about at this one. */
export async function carryOverTasks(standupId: string) {
  const [standups, tasks] = await Promise.all([listStandups(), listTasks()]);
  const current = standups.find((s) => s.id === standupId);
  if (!current) return [];
  return tasks
    .filter((task) => task.standupId && task.standupId !== standupId)
    .filter((task) => task.status !== "DONE" && task.status !== "CANCELLED")
    .map((task) => ({
      task,
      from: standups.find((s) => s.id === task.standupId),
    }))
    .filter(
      (row): row is { task: (typeof tasks)[number]; from: Standup } =>
        !!row.from && sortKey(row.from) < sortKey(current),
    )
    .sort((a, b) => sortKey(b.from).localeCompare(sortKey(a.from)));
}

export async function tasksOfStandup(standupId: string) {
  return (await listTasks()).filter((task) => task.standupId === standupId);
}

/* ------------------------------- statistics ------------------------------- */

export interface PersonAttendance {
  userId: string;
  name: string;
  /** Calls where this person was marked at all. */
  marked: number;
  attended: number;
  late: number;
  absent: number;
  /** Warned in advance or excused. */
  excused: number;
  percent: number | null;
}

export interface AttendanceStats {
  calls: number;
  people: PersonAttendance[];
  teamPercent: number | null;
  months: { month: string; calls: number; percent: number | null }[];
}

const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];
const ABSENT_STATUSES: AttendanceStatus[] = ["ABSENT", "WARNED", "EXCUSED"];
const percentOf = (attended: number, marked: number) =>
  marked === 0 ? null : Math.round((attended / marked) * 100);

/**
 * A call counts once somebody has been marked on it and it was not cancelled;
 * a person counts on it only if they were marked, so a call nobody got round
 * to filling in for them doesn't read as an absence.
 */
export async function attendanceStats(days: number): Promise<AttendanceStats> {
  const standups = await listStandups();
  const today = wallNow().date;
  const since = addDays(today, -(days - 1));

  const held = standups.filter(
    (s) => s.status !== "CANCELLED" && s.attendance.some((a) => a.status !== "UNMARKED"),
  );
  const inRange = held.filter((s) => s.date >= since && s.date <= today);

  const byPerson = new Map<string, PersonAttendance>();
  for (const standup of inRange) {
    for (const entry of standup.attendance) {
      if (entry.guest || !entry.userId || entry.status === "UNMARKED") continue;
      const row = byPerson.get(entry.userId) ?? {
        userId: entry.userId,
        name: entry.name,
        marked: 0,
        attended: 0,
        late: 0,
        absent: 0,
        excused: 0,
        percent: null,
      };
      row.marked++;
      if (ATTENDED.includes(entry.status)) row.attended++;
      if (entry.status === "LATE") row.late++;
      if (entry.status === "ABSENT") row.absent++;
      if (entry.status === "WARNED" || entry.status === "EXCUSED") row.excused++;
      byPerson.set(entry.userId, row);
    }
  }
  const people = [...byPerson.values()].map((p) => ({
    ...p,
    percent: percentOf(p.attended, p.marked),
  }));
  people.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name));

  const totalMarked = people.reduce((n, p) => n + p.marked, 0);
  const totalAttended = people.reduce((n, p) => n + p.attended, 0);

  // Last six calendar months, whatever period is chosen above.
  const months: AttendanceStats["months"] = [];
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  for (let i = 5; i >= 0; i--) {
    const index = ty * 12 + (tm - 1) - i;
    const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    const calls = held.filter((s) => s.date.startsWith(month));
    let marked = 0;
    let attended = 0;
    for (const s of calls) {
      for (const a of s.attendance) {
        if (a.guest || !a.userId || a.status === "UNMARKED") continue;
        marked++;
        if (ATTENDED.includes(a.status)) attended++;
      }
    }
    months.push({ month, calls: calls.length, percent: percentOf(attended, marked) });
  }

  return {
    calls: inRange.length,
    people,
    teamPercent: percentOf(totalAttended, totalMarked),
    months,
  };
}

export async function personHistory(userId: string) {
  const standups = await listStandups();
  const rows = standups
    .filter((s) => s.status !== "CANCELLED")
    .flatMap((s) => {
      const entry = s.attendance.find((a) => a.userId === userId);
      return entry ? [{ standup: s, entry }] : [];
    });
  const marked = rows.filter((r) => r.entry.status !== "UNMARKED");
  const tasks = (await listTasks()).filter((t) => t.ownerId === userId && t.standupId);
  return {
    rows,
    attended: marked.filter((r) => ATTENDED.includes(r.entry.status)).length,
    late: marked.filter((r) => r.entry.status === "LATE").length,
    absent: marked.filter((r) => ABSENT_STATUSES.includes(r.entry.status)).length,
    marked: marked.length,
    tasks,
  };
}
