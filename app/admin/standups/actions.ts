"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthzError } from "@/lib/crm/repo";
import { CrmStoreError } from "@/lib/crm/store";
import {
  addGuest,
  cancelStandup,
  createStandup,
  createStandupTask,
  deleteStandup,
  markAllPresent,
  removeGuest,
  rescheduleStandup,
  restoreStandup,
  saveSchedule,
  saveSummary,
  setAttendance,
  updateStandupText,
} from "@/lib/crm/standups";
import type { ActionResult } from "../crm/actions";
import {
  ABSENCE_REASONS,
  ATTENDANCE_STATUSES,
  type AbsenceReason,
  type AttendanceStatus,
  type Priority,
} from "@/types/crm";

async function run(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    const created = await work();
    revalidatePath("/admin", "layout");
    const id =
      created && typeof created === "object" && "id" in created
        ? String((created as { id: unknown }).id)
        : undefined;
    return { ok: true, id };
  } catch (error) {
    if (error instanceof AuthzError || error instanceof CrmStoreError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось сохранить.",
    };
  }
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Textareas keep their line breaks and surrounding spaces. */
const raw = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export async function createStandupAction(form: FormData): Promise<ActionResult> {
  const title = text(form, "title");
  const date = text(form, "date");
  const time = text(form, "time") ?? "10:00";
  if (!title) return { ok: false, error: "Укажите тему созвона." };
  if (!date || !DATE.test(date)) return { ok: false, error: "Укажите дату." };
  if (!TIME.test(time)) return { ok: false, error: "Время — в формате ЧЧ:ММ." };

  const result = await run(() =>
    createStandup({ title, date, time, link: text(form, "link"), agenda: raw(form, "agenda") }),
  );
  if (result.ok && result.id) redirect(`/admin/standups/${result.id}`);
  return result;
}

export async function saveNotesAction(id: string, form: FormData): Promise<ActionResult> {
  return run(() =>
    updateStandupText(id, {
      title: text(form, "title"),
      link: text(form, "link") ?? "",
      agenda: raw(form, "agenda"),
      notes: raw(form, "notes"),
    }),
  );
}

export async function saveSummaryAction(id: string, form: FormData): Promise<ActionResult> {
  return run(() =>
    saveSummary(id, {
      summary: raw(form, "summary"),
      pinned: form.get("pinned") === "on",
      finish: form.get("finish") === "on",
    }),
  );
}

export async function cancelStandupAction(id: string, form: FormData): Promise<ActionResult> {
  return run(() => cancelStandup(id, text(form, "reason") ?? ""));
}

export async function restoreStandupAction(id: string): Promise<ActionResult> {
  return run(() => restoreStandup(id));
}

export async function rescheduleStandupAction(id: string, form: FormData): Promise<ActionResult> {
  const date = text(form, "date");
  const time = text(form, "time");
  if (!date || !DATE.test(date) || !time || !TIME.test(time)) {
    return { ok: false, error: "Укажите новую дату и время." };
  }
  return run(() => rescheduleStandup(id, { date, time, reason: text(form, "reason") ?? "" }));
}

export async function deleteStandupAction(id: string): Promise<ActionResult> {
  const result = await run(() => deleteStandup(id));
  if (result.ok) redirect("/admin/standups");
  return result;
}

/** Called straight from the attendance table, one change at a time. */
export async function setAttendanceAction(
  id: string,
  entryId: string,
  status: AttendanceStatus,
  reason: AbsenceReason | "",
  reasonText: string,
): Promise<ActionResult> {
  if (!ATTENDANCE_STATUSES.includes(status)) return { ok: false, error: "Неизвестный статус." };
  return run(() =>
    setAttendance(id, entryId, {
      status,
      reason: reason && ABSENCE_REASONS.includes(reason) ? reason : undefined,
      reasonText,
    }),
  );
}

export async function markAllPresentAction(id: string): Promise<ActionResult> {
  return run(() => markAllPresent(id));
}

export async function addGuestAction(id: string, form: FormData): Promise<ActionResult> {
  return run(() => addGuest(id, text(form, "name") ?? ""));
}

export async function removeGuestAction(id: string, entryId: string): Promise<ActionResult> {
  return run(() => removeGuest(id, entryId));
}

export async function createStandupTaskAction(id: string, form: FormData): Promise<ActionResult> {
  const title = text(form, "title");
  if (!title) return { ok: false, error: "Укажите, что нужно сделать." };
  return run(() =>
    createStandupTask(id, {
      title,
      ownerId: text(form, "ownerId"),
      dueAt: text(form, "dueAt"),
      description: text(form, "description"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
    }),
  );
}

export async function saveScheduleAction(form: FormData): Promise<ActionResult> {
  const time = text(form, "time") ?? "10:00";
  if (!TIME.test(time)) return { ok: false, error: "Время — в формате ЧЧ:ММ." };
  const days = form
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => d >= 1 && d <= 7);
  return run(() =>
    saveSchedule({
      enabled: form.get("enabled") === "on",
      days,
      time,
      title: text(form, "title") ?? "Дэйли",
      link: text(form, "link"),
      agenda: raw(form, "agenda"),
    }),
  );
}
