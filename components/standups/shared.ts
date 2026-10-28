import type { AbsenceReason, AttendanceStatus, StandupStatus } from "@/types/crm";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  UNMARKED: "Не отмечен",
  PRESENT: "Присутствовал",
  LATE: "Опоздал",
  ABSENT: "Отсутствовал",
  WARNED: "Предупредил",
  EXCUSED: "Уважительная причина",
};

export const REASON_LABEL: Record<AbsenceReason, string> = {
  ILLNESS: "Болезнь",
  STUDY_WORK: "Учёба / работа",
  TECHNICAL: "Технические проблемы",
  WARNED_EARLIER: "Предупредил заранее",
  PERSONAL: "Личная причина",
  OTHER: "Другое",
};

/** Statuses that can carry a reason. */
export const NEEDS_REASON: AttendanceStatus[] = ["ABSENT", "WARNED", "EXCUSED", "LATE"];

/** Dot and text colour per status — one place, so the table and lists agree. */
export const STATUS_TONE: Record<AttendanceStatus, { dot: string; text: string }> = {
  UNMARKED: { dot: "bg-subtle-foreground", text: "text-muted-foreground" },
  PRESENT: { dot: "bg-[var(--success)]", text: "text-[var(--success)]" },
  LATE: { dot: "bg-[var(--warning)]", text: "text-[var(--warning)]" },
  ABSENT: { dot: "bg-destructive", text: "text-destructive" },
  WARNED: { dot: "bg-[var(--warning)]", text: "text-[var(--warning)]" },
  EXCUSED: { dot: "bg-primary", text: "text-primary" },
};

export const STANDUP_STATUS_LABEL: Record<StandupStatus, string> = {
  PLANNED: "Запланирован",
  HELD: "Проведён",
  CANCELLED: "Отменён",
};

export const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "пн, 3 нояб." — the stored wall-clock date, with no time-zone shifting. */
export function formatStandupDate(date: string) {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMonth(month: string) {
  const label = MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
