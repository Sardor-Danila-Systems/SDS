"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AuthzError,
  addLeadActivity,
  addExpense,
  addTaskComment,
  createTeamUser,
  setUserActive,
  addPayment,
  deleteExpense,
  createClientProject,
  createMeeting,
  createProposal,
  setProposalStatus,
  updateClientProject,
  convertLeadToClient,
  convertProspectToLead,
  createLead,
  createProspect,
  createTask,
  setLeadStage,
  updateLead,
  updateProspect,
  updateTask,
} from "@/lib/crm/repo";
import { CrmStoreError } from "@/lib/crm/store";
import {
  EXPENSE_CATEGORIES,
  ROLES,
  type ExpenseCategory,
  type Role,
} from "@/types/crm";
import type {
  ActivityKind,
  ClientProjectStatus,
  LeadStage,
  MeetingType,
  Priority,
  ProposalStatus,
  ProspectStage,
  Source,
  TaskStatus,
} from "@/types/crm";

/*
  Server actions for the CRM.

  Every one of these re-checks permission inside the repository, so a crafted
  request is refused exactly like a hidden button would be. They return a
  result object instead of throwing, so forms can show what went wrong.
*/

/** `id` is the created record's, when the action made one. */
export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function run(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    const created = await work();
    // The CRM is read on every screen; refresh the whole admin subtree.
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

const money = (form: FormData, amountKey: string, currencyKey: string) => {
  const raw = text(form, amountKey);
  if (!raw) return undefined;
  const amount = Number(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amount, currency: text(form, currencyKey) ?? "UZS" };
};

/* -------------------------------- prospects ------------------------------- */

export async function addProspectAction(form: FormData): Promise<ActionResult> {
  const company = text(form, "company");
  if (!company) return { ok: false, error: "Укажите компанию." };

  return run(() =>
    createProspect({
      company,
      contactName: text(form, "contactName"),
      website: text(form, "website"),
      instagram: text(form, "instagram"),
      telegram: text(form, "telegram"),
      email: text(form, "email"),
      phone: text(form, "phone"),
      country: text(form, "country"),
      city: text(form, "city"),
      service: text(form, "service"),
      estimatedBudget: money(form, "budget", "currency"),
      source: (text(form, "source") as Source) ?? "OTHER",
      nextActionTitle: text(form, "nextActionTitle"),
      nextActionAt: text(form, "nextActionAt"),
      notes: text(form, "notes"),
    }),
  );
}

export async function setProspectStageAction(
  prospectId: string,
  stage: ProspectStage,
): Promise<ActionResult> {
  return run(() => updateProspect(prospectId, { stage }));
}

export async function convertProspectAction(
  prospectId: string,
): Promise<ActionResult> {
  return run(() => convertProspectToLead(prospectId));
}

/* ---------------------------------- leads --------------------------------- */

export async function addLeadAction(form: FormData): Promise<ActionResult> {
  const firstName = text(form, "firstName");
  if (!firstName) return { ok: false, error: "Укажите имя." };

  const result = await run(() =>
    createLead({
      firstName,
      lastName: text(form, "lastName"),
      company: text(form, "company"),
      position: text(form, "position"),
      phone: text(form, "phone"),
      email: text(form, "email"),
      telegram: text(form, "telegram"),
      instagram: text(form, "instagram"),
      linkedin: text(form, "linkedin"),
      country: text(form, "country"),
      city: text(form, "city"),
      source: (text(form, "source") as Source) ?? "OTHER",
      service: text(form, "service"),
      description: text(form, "description"),
      budget: money(form, "budget", "currency"),
      timeline: text(form, "timeline"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
      nextActionTitle: text(form, "nextActionTitle"),
      nextActionAt: text(form, "nextActionAt"),
    }),
  );

  // Outside `run`, so the redirect isn't swallowed by its catch.
  if (result.ok && result.id) redirect(`/admin/crm/leads/${result.id}`);
  return result;
}

export async function updateLeadAction(
  leadId: string,
  form: FormData,
): Promise<ActionResult> {
  return run(() =>
    updateLead(leadId, {
      company: text(form, "company"),
      position: text(form, "position"),
      phone: text(form, "phone"),
      email: text(form, "email"),
      telegram: text(form, "telegram"),
      instagram: text(form, "instagram"),
      linkedin: text(form, "linkedin"),
      country: text(form, "country"),
      city: text(form, "city"),
      service: text(form, "service"),
      description: text(form, "description"),
      budget: money(form, "budget", "currency"),
      proposedPrice: money(form, "proposedPrice", "currency"),
      timeline: text(form, "timeline"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
      notes: text(form, "notes"),
    }),
  );
}

export async function setLeadStageAction(
  leadId: string,
  stage: LeadStage,
): Promise<ActionResult> {
  return run(() => setLeadStage(leadId, stage));
}

export async function setNextActionAction(
  leadId: string,
  form: FormData,
): Promise<ActionResult> {
  return run(() =>
    updateLead(leadId, {
      nextActionTitle: text(form, "nextActionTitle"),
      nextActionAt: text(form, "nextActionAt"),
    }),
  );
}

export async function addActivityAction(
  leadId: string,
  form: FormData,
): Promise<ActionResult> {
  const summary = text(form, "summary");
  if (!summary) return { ok: false, error: "Опишите, что произошло." };

  return run(() =>
    addLeadActivity(leadId, {
      kind: (text(form, "kind") as ActivityKind) ?? "NOTE",
      summary,
      detail: text(form, "detail"),
    }),
  );
}

export async function convertLeadAction(leadId: string): Promise<ActionResult> {
  return run(() => convertLeadToClient(leadId));
}

/* ---------------------------------- tasks --------------------------------- */

export async function addTaskAction(form: FormData): Promise<ActionResult> {
  const title = text(form, "title");
  if (!title) return { ok: false, error: "Укажите название задачи." };

  return run(() =>
    createTask({
      title,
      description: text(form, "description"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
      dueAt: text(form, "dueAt"),
      entityType: text(form, "entityType") as "lead" | undefined,
      entityId: text(form, "entityId"),
      ownerId: text(form, "ownerId"),
      projectId: text(form, "projectId"),
    }),
  );
}

export async function setTaskStatusAction(
  taskId: string,
  status: TaskStatus,
): Promise<ActionResult> {
  return run(() => updateTask(taskId, { status }));
}

/* -------------------------------- meetings -------------------------------- */

export async function addMeetingAction(form: FormData): Promise<ActionResult> {
  const title = text(form, "title");
  const date = text(form, "date");
  if (!title) return { ok: false, error: "Укажите тему встречи." };
  if (!date) return { ok: false, error: "Укажите дату." };

  const time = text(form, "time") ?? "10:00";

  return run(() =>
    createMeeting({
      title,
      startAt: new Date(`${date}T${time}`).toISOString(),
      type: (text(form, "type") as MeetingType) ?? "CALL",
      location: text(form, "location"),
      description: text(form, "description"),
      entityType: text(form, "entityId") ? "lead" : undefined,
      entityId: text(form, "entityId"),
    }),
  );
}

/* -------------------------------- proposals ------------------------------- */

export async function addProposalAction(form: FormData): Promise<ActionResult> {
  const leadId = text(form, "leadId");
  const title = text(form, "title");
  const amountRaw = text(form, "amount");
  if (!leadId) return { ok: false, error: "Выберите лид." };
  if (!title) return { ok: false, error: "Укажите название КП." };

  const amount = Number((amountRaw ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Укажите сумму." };
  }

  return run(() =>
    createProposal({
      leadId,
      title,
      services: (text(form, "services") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      amount,
      currency: text(form, "currency") ?? "UZS",
      timeline: text(form, "timeline"),
      description: text(form, "description"),
    }),
  );
}

export async function setProposalStatusAction(
  proposalId: string,
  status: ProposalStatus,
): Promise<ActionResult> {
  return run(() => setProposalStatus(proposalId, status));
}

/* --------------------------- projects and money --------------------------- */

export async function addClientProjectAction(
  form: FormData,
): Promise<ActionResult> {
  const clientId = text(form, "clientId");
  const name = text(form, "name");
  if (!clientId) return { ok: false, error: "Выберите клиента." };
  if (!name) return { ok: false, error: "Укажите название проекта." };

  return run(() =>
    createClientProject({
      clientId,
      name,
      description: text(form, "description"),
      deadline: text(form, "deadline"),
      price: money(form, "price", "currency"),
      requirements: text(form, "requirements"),
    }),
  );
}

export async function setProjectStatusAction(
  projectId: string,
  status: ClientProjectStatus,
): Promise<ActionResult> {
  return run(() => updateClientProject(projectId, { status }));
}

export async function addPaymentAction(
  projectId: string,
  form: FormData,
): Promise<ActionResult> {
  const amount = Number((text(form, "amount") ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Укажите сумму платежа." };
  }

  return run(() =>
    addPayment(projectId, {
      amount,
      currency: text(form, "currency") ?? "UZS",
      paidAt: text(form, "paidAt") ?? new Date().toISOString().slice(0, 10),
      note: text(form, "note"),
    }),
  );
}

export async function addExpenseAction(form: FormData): Promise<ActionResult> {
  const amount = Number((text(form, "amount") ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Укажите сумму расхода." };
  }
  const category = text(form, "category") as ExpenseCategory | undefined;

  return run(() =>
    addExpense({
      amount,
      currency: text(form, "currency") ?? "UZS",
      paidAt: text(form, "paidAt") ?? new Date().toISOString().slice(0, 10),
      category:
        category && EXPENSE_CATEGORIES.includes(category) ? category : "OTHER",
      note: text(form, "note"),
      projectId: text(form, "projectId"),
    }),
  );
}

export async function deleteExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  return run(() => deleteExpense(expenseId));
}

/* ---------------------------------- team ---------------------------------- */

export async function assignTaskOwnerAction(
  taskId: string,
  ownerId: string,
): Promise<ActionResult> {
  return run(() => updateTask(taskId, { ownerId }));
}

export async function createUserAction(form: FormData): Promise<ActionResult> {
  const name = text(form, "name");
  const login = text(form, "login");
  const password = text(form, "password");
  const role = text(form, "role") as Role | undefined;
  if (!name || !login || !password) {
    return { ok: false, error: "Укажите имя, логин и пароль." };
  }
  if (!role || !ROLES.includes(role)) {
    return { ok: false, error: "Выберите роль." };
  }
  return run(() => createTeamUser({ name, login, password, role }));
}

export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  return run(() => setUserActive(userId, active));
}

/* --------------------------------- tracker -------------------------------- */

export async function editTaskAction(
  taskId: string,
  form: FormData,
): Promise<ActionResult> {
  const title = text(form, "title");
  if (!title) return { ok: false, error: "Укажите название задачи." };
  const ownerId = text(form, "ownerId");

  return run(() =>
    updateTask(taskId, {
      title,
      description: text(form, "description"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
      dueAt: text(form, "dueAt"),
      projectId: text(form, "projectId"),
      ...(ownerId ? { ownerId } : {}),
    }),
  );
}

export async function commentTaskAction(
  taskId: string,
  form: FormData,
): Promise<ActionResult> {
  return run(() => addTaskComment(taskId, text(form, "text") ?? ""));
}

export async function createTrackerTaskAction(
  form: FormData,
): Promise<ActionResult> {
  const title = text(form, "title");
  if (!title) return { ok: false, error: "Укажите название задачи." };

  const result = await run(() =>
    createTask({
      title,
      description: text(form, "description"),
      priority: (text(form, "priority") as Priority) ?? "MEDIUM",
      dueAt: text(form, "dueAt"),
      ownerId: text(form, "ownerId"),
      projectId: text(form, "projectId"),
    }),
  );
  if (result.ok && result.id) redirect(`/admin/tracker/${result.id}`);
  return result;
}
