import "server-only";
import { cache } from "react";
import {
  createSalt,
  getSessionUser,
  hashPassword,
  type SessionUser,
} from "@/lib/auth";
import { can, type Permission } from "./rbac";
import { mutateCrm, readCrm } from "./store";
import type {
  Activity,
  ActivityKind,
  Client,
  ClientProject,
  CrmData,
  EntityType,
  Expense,
  ExpenseCategory,
  Lead,
  LeadStage,
  Meeting,
  Proposal,
  ProposalStatus,
  Prospect,
  Role,
  Task,
  User,
} from "@/types/crm";

/*
  Everything the CRM does goes through here.

  Two rules the whole module holds to:

  1. Authorisation happens in the mutation, not in the page. `requirePermission`
     throws before anything is written, so a hand-crafted request is refused the
     same way a hidden button would be.
  2. Nothing is destroyed. Records are soft-deleted and conversions link rather
     than move, so a prospect that became a lead that became a client still has
     one continuous history.
*/

export class AuthzError extends Error {}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthzError("Требуется вход.");
  return user;
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthzError("Недостаточно прав для этого действия.");
  }
  return user;
}

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const alive = <T extends { deletedAt?: string }>(rows: T[]) =>
  rows.filter((row) => !row.deletedAt);

/* ---------------------------------- reads --------------------------------- */

/*
  One document read per request.

  Every list below asks for the whole CRM, and a single screen calls several of
  them — leads, tasks, meetings, notifications in the layout. `cache` makes
  them share one read for the duration of the request; the store's own memo
  covers the gap between requests.
*/
const crmOnce = cache(readCrm);

export async function getCrm(): Promise<CrmData> {
  await requirePermission("crm.view");
  return crmOnce();
}

export async function listProspects() {
  const { prospects } = await getCrm();
  return alive(prospects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listLeads() {
  const { leads } = await getCrm();
  return alive(leads).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listClients() {
  const { clients } = await getCrm();
  return alive(clients).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Admin sees every task; everyone else sees the ones assigned to them. */
function visibleTasks(user: SessionUser, tasks: Task[]) {
  const rows = alive(tasks);
  return can(user.role, "task.assign")
    ? rows
    : rows.filter((task) => task.ownerId === user.id);
}

export async function listTasks() {
  const user = await requirePermission("crm.view");
  const { tasks } = await getCrm();
  return visibleTasks(user, tasks);
}

export async function listMeetings() {
  const { meetings } = await getCrm();
  return alive(meetings).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function listProjects() {
  const { projects } = await getCrm();
  return alive(projects);
}

export async function listExpenses() {
  await requirePermission("finance.report");
  const { expenses } = await getCrm();
  return alive(expenses).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export async function getLead(leadId: string) {
  const { leads } = await getCrm();
  return alive(leads).find((lead) => lead.id === leadId) ?? null;
}

export async function getClient(clientId: string) {
  const { clients } = await getCrm();
  return alive(clients).find((client) => client.id === clientId) ?? null;
}

export async function activitiesFor(entityType: EntityType, entityId: string) {
  const { activities } = await getCrm();
  return activities
    .filter((a) => a.entityType === entityType && a.entityId === entityId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* -------------------------------- activity -------------------------------- */

function log(
  data: CrmData,
  actor: SessionUser,
  entry: {
    kind: ActivityKind;
    entityType: EntityType;
    entityId: string;
    summary: string;
    detail?: string;
    from?: string;
    to?: string;
  },
): Activity {
  const activity: Activity = {
    id: id(),
    actorId: actor.id,
    actorName: actor.name,
    createdAt: now(),
    ...entry,
  };
  data.activities.push(activity);
  return activity;
}

/* -------------------------------- prospects ------------------------------- */

export type ProspectInput = Partial<Prospect> & { company: string };

export async function createProspect(input: ProspectInput) {
  const actor = await requirePermission("prospect.write");

  return mutateCrm((data) => {
    const prospect: Prospect = {
      id: id(),
      company: input.company.trim(),
      contactName: input.contactName,
      website: input.website,
      instagram: input.instagram,
      telegram: input.telegram,
      email: input.email,
      phone: input.phone,
      country: input.country,
      city: input.city,
      service: input.service,
      estimatedBudget: input.estimatedBudget,
      source: input.source ?? "OTHER",
      stage: input.stage ?? "TO_CONTACT",
      ownerId: input.ownerId ?? actor.id,
      nextActionTitle: input.nextActionTitle,
      nextActionAt: input.nextActionAt,
      notes: input.notes,
      createdAt: now(),
      updatedAt: now(),
    };
    data.prospects.push(prospect);
    log(data, actor, {
      kind: "CREATED",
      entityType: "prospect",
      entityId: prospect.id,
      summary: `Добавлен prospect «${prospect.company}»`,
    });
    return prospect;
  });
}

export async function updateProspect(
  prospectId: string,
  patch: Partial<Prospect>,
) {
  const actor = await requirePermission("prospect.write");

  return mutateCrm((data) => {
    const prospect = data.prospects.find((p) => p.id === prospectId);
    if (!prospect) throw new Error("Prospect не найден.");

    const stageChanged = patch.stage && patch.stage !== prospect.stage;
    const previous = prospect.stage;

    Object.assign(prospect, patch, { updatedAt: now() });

    log(data, actor, {
      kind: stageChanged ? "STATUS_CHANGE" : "UPDATED",
      entityType: "prospect",
      entityId: prospect.id,
      summary: stageChanged
        ? `Статус: ${previous} → ${prospect.stage}`
        : "Карточка обновлена",
      from: stageChanged ? previous : undefined,
      to: stageChanged ? prospect.stage : undefined,
    });
    return prospect;
  });
}

export async function deleteProspect(prospectId: string) {
  const actor = await requirePermission("prospect.delete");
  return mutateCrm((data) => {
    const prospect = data.prospects.find((p) => p.id === prospectId);
    if (!prospect) return false;
    prospect.deletedAt = now();
    log(data, actor, {
      kind: "UPDATED",
      entityType: "prospect",
      entityId: prospect.id,
      summary: "Prospect удалён",
    });
    return true;
  });
}

/**
 * Prospect → Lead. The prospect is kept and linked rather than removed, and a
 * second conversion is refused so the same company can't enter twice.
 */
export async function convertProspectToLead(prospectId: string) {
  const actor = await requirePermission("lead.write");

  return mutateCrm((data) => {
    const prospect = data.prospects.find((p) => p.id === prospectId);
    if (!prospect) throw new Error("Prospect не найден.");
    if (prospect.convertedLeadId) {
      const existing = data.leads.find((l) => l.id === prospect.convertedLeadId);
      if (existing && !existing.deletedAt) return existing;
    }

    const [firstName, ...rest] = (prospect.contactName ?? prospect.company)
      .trim()
      .split(" ");

    const lead: Lead = {
      id: id(),
      firstName: firstName || prospect.company,
      lastName: rest.join(" ") || undefined,
      company: prospect.company,
      phone: prospect.phone,
      email: prospect.email,
      telegram: prospect.telegram,
      instagram: prospect.instagram,
      country: prospect.country,
      city: prospect.city,
      source: prospect.source,
      ownerId: prospect.ownerId ?? actor.id,
      stage: "NEW",
      service: prospect.service,
      budget: prospect.estimatedBudget,
      priority: "MEDIUM",
      nextActionTitle: prospect.nextActionTitle,
      nextActionAt: prospect.nextActionAt,
      notes: prospect.notes,
      prospectId: prospect.id,
      createdAt: now(),
      updatedAt: now(),
    };

    data.leads.push(lead);
    prospect.convertedLeadId = lead.id;
    prospect.stage = "INTERESTED";
    prospect.updatedAt = now();

    log(data, actor, {
      kind: "CONVERTED",
      entityType: "prospect",
      entityId: prospect.id,
      summary: `Prospect переведён в лид «${lead.company ?? lead.firstName}»`,
    });
    log(data, actor, {
      kind: "CREATED",
      entityType: "lead",
      entityId: lead.id,
      summary: `Лид создан из prospect «${prospect.company}»`,
    });

    return lead;
  });
}

/* ---------------------------------- leads --------------------------------- */

export type LeadInput = Partial<Lead> & { firstName: string };

export async function createLead(input: LeadInput) {
  const actor = await requirePermission("lead.write");

  return mutateCrm((data) => {
    const lead: Lead = {
      id: id(),
      firstName: input.firstName.trim(),
      lastName: input.lastName,
      company: input.company,
      position: input.position,
      phone: input.phone,
      email: input.email,
      telegram: input.telegram,
      instagram: input.instagram,
      linkedin: input.linkedin,
      country: input.country,
      city: input.city,
      source: input.source ?? "OTHER",
      ownerId: input.ownerId ?? actor.id,
      stage: input.stage ?? "NEW",
      service: input.service,
      description: input.description,
      budget: input.budget,
      proposedPrice: input.proposedPrice,
      timeline: input.timeline,
      priority: input.priority ?? "MEDIUM",
      nextActionTitle: input.nextActionTitle,
      nextActionAt: input.nextActionAt,
      notes: input.notes,
      createdAt: now(),
      updatedAt: now(),
    };
    data.leads.push(lead);
    log(data, actor, {
      kind: "CREATED",
      entityType: "lead",
      entityId: lead.id,
      summary: `Лид создан: ${lead.company ?? lead.firstName}`,
    });
    return lead;
  });
}

export async function updateLead(leadId: string, patch: Partial<Lead>) {
  const actor = await requirePermission("lead.write");

  return mutateCrm((data) => {
    const lead = data.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Лид не найден.");

    const stageChanged = patch.stage && patch.stage !== lead.stage;
    const previous = lead.stage;

    Object.assign(lead, patch, { updatedAt: now() });

    if (stageChanged) {
      log(data, actor, {
        kind: "STATUS_CHANGE",
        entityType: "lead",
        entityId: lead.id,
        summary: `Статус: ${previous} → ${lead.stage}`,
        from: previous,
        to: lead.stage,
      });
    } else {
      log(data, actor, {
        kind: "UPDATED",
        entityType: "lead",
        entityId: lead.id,
        summary: "Карточка обновлена",
      });
    }
    return lead;
  });
}

export async function setLeadStage(leadId: string, stage: LeadStage) {
  return updateLead(leadId, { stage });
}

export async function addLeadActivity(
  leadId: string,
  entry: { kind: ActivityKind; summary: string; detail?: string },
) {
  const actor = await requirePermission("lead.write");
  return mutateCrm((data) => {
    const lead = data.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Лид не найден.");
    lead.updatedAt = now();
    return log(data, actor, {
      ...entry,
      entityType: "lead",
      entityId: leadId,
    });
  });
}

export async function deleteLead(leadId: string) {
  const actor = await requirePermission("lead.delete");
  return mutateCrm((data) => {
    const lead = data.leads.find((l) => l.id === leadId);
    if (!lead) return false;
    lead.deletedAt = now();
    log(data, actor, {
      kind: "UPDATED",
      entityType: "lead",
      entityId: lead.id,
      summary: "Лид удалён",
    });
    return true;
  });
}

/* --------------------------------- clients -------------------------------- */

/** Lead → Client. The lead stays, marked won and linked to the client. */
export async function convertLeadToClient(leadId: string) {
  const actor = await requirePermission("client.write");

  return mutateCrm((data) => {
    const lead = data.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Лид не найден.");

    if (lead.clientId) {
      const existing = data.clients.find((c) => c.id === lead.clientId);
      if (existing && !existing.deletedAt) return existing;
    }

    const client: Client = {
      id: id(),
      name: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      telegram: lead.telegram,
      country: lead.country,
      city: lead.city,
      ownerId: lead.ownerId ?? actor.id,
      leadId: lead.id,
      notes: lead.notes,
      createdAt: now(),
      updatedAt: now(),
    };

    data.clients.push(client);
    lead.clientId = client.id;
    if (lead.stage !== "WON") {
      log(data, actor, {
        kind: "STATUS_CHANGE",
        entityType: "lead",
        entityId: lead.id,
        summary: `Статус: ${lead.stage} → WON`,
        from: lead.stage,
        to: "WON",
      });
      lead.stage = "WON";
    }
    lead.updatedAt = now();

    log(data, actor, {
      kind: "CONVERTED",
      entityType: "client",
      entityId: client.id,
      summary: `Клиент создан из лида «${client.company ?? client.name}»`,
    });

    return client;
  });
}

/* --------------------------------- projects ------------------------------- */

/** Client → ClientProject, prefilled from the lead so nothing is retyped. */
export async function createClientProject(input: {
  clientId: string;
  name: string;
  leadId?: string;
  description?: string;
  deadline?: string;
  price?: ClientProject["price"];
  requirements?: string;
}) {
  const actor = await requirePermission("project.write");

  return mutateCrm((data) => {
    const client = data.clients.find((c) => c.id === input.clientId);
    if (!client) throw new Error("Клиент не найден.");

    const lead = input.leadId
      ? data.leads.find((l) => l.id === input.leadId)
      : data.leads.find((l) => l.clientId === client.id);

    const project: ClientProject = {
      id: id(),
      clientId: client.id,
      name: input.name.trim(),
      description: input.description ?? lead?.description,
      status: "PLANNING",
      startDate: now().slice(0, 10),
      deadline: input.deadline,
      price: input.price ?? lead?.proposedPrice ?? lead?.budget,
      payments: [],
      ownerId: client.ownerId ?? actor.id,
      team: [],
      requirements: input.requirements ?? lead?.description,
      leadId: lead?.id,
      createdAt: now(),
      updatedAt: now(),
    };

    data.projects.push(project);
    log(data, actor, {
      kind: "PROJECT_CREATED",
      entityType: "client",
      entityId: client.id,
      summary: `Создан проект «${project.name}»`,
    });
    return project;
  });
}

/* ---------------------------------- tasks --------------------------------- */

function userName(data: CrmData, userId?: string) {
  if (!userId) return "без исполнителя";
  return (
    data.users.find((u) => u.id === userId)?.name ??
    (userId === "bootstrap-admin" ? "Администратор" : "неизвестный")
  );
}

export async function createTask(input: Partial<Task> & { title: string }) {
  const actor = await requirePermission("task.write");
  const mayAssign = can(actor.role, "task.assign");

  return mutateCrm((data) => {
    const ownerId = mayAssign ? (input.ownerId ?? actor.id) : actor.id;
    if (
      ownerId !== actor.id &&
      ownerId !== "bootstrap-admin" &&
      !data.users.some((u) => u.id === ownerId && u.active)
    ) {
      throw new Error("Исполнитель не найден.");
    }

    const task: Task = {
      id: id(),
      title: input.title.trim(),
      description: input.description,
      status: input.status ?? "TODO",
      priority: input.priority ?? "MEDIUM",
      dueAt: input.dueAt,
      ownerId,
      createdById: actor.id,
      createdByName: actor.name,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: now(),
      updatedAt: now(),
    };
    data.tasks.push(task);

    log(data, actor, {
      kind: "CREATED",
      entityType: "task",
      entityId: task.id,
      summary:
        ownerId === actor.id
          ? `Задача: ${task.title}`
          : `Задача для ${userName(data, ownerId)}: ${task.title}`,
    });
    return task;
  });
}

export async function updateTask(taskId: string, patch: Partial<Task>) {
  const actor = await requirePermission("task.write");
  const mayAssign = can(actor.role, "task.assign");

  return mutateCrm((data) => {
    const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt);
    if (!task || (!mayAssign && task.ownerId !== actor.id)) {
      // The same answer for "missing" and "not yours" — no probing by id.
      throw new Error("Задача не найдена.");
    }

    // Only whoever hands out the work may move it to someone else.
    const { ownerId, ...rest } = patch;
    const safe: Partial<Task> = mayAssign ? { ...rest, ownerId } : rest;
    if (!mayAssign || ownerId === undefined) delete safe.ownerId;

    const previous = task.status;
    const completing = safe.status === "DONE" && previous !== "DONE";
    Object.assign(task, safe, { updatedAt: now() });
    if (completing) task.completedAt = now();
    if (safe.status && safe.status !== "DONE") task.completedAt = undefined;

    if (safe.status && safe.status !== previous) {
      log(data, actor, {
        kind: completing ? "TASK_COMPLETED" : "STATUS_CHANGE",
        entityType: "task",
        entityId: task.id,
        summary: `${task.title}: ${previous} → ${task.status}`,
        from: previous,
        to: task.status,
      });
    }
    if (completing && task.entityType && task.entityId) {
      log(data, actor, {
        kind: "TASK_COMPLETED",
        entityType: task.entityType,
        entityId: task.entityId,
        summary: `Задача выполнена: ${task.title}`,
      });
    }
    return task;
  });
}

/* -------------------------------- meetings -------------------------------- */

export async function createMeeting(
  input: Partial<Meeting> & { title: string; startAt: string },
) {
  const actor = await requirePermission("meeting.write");

  return mutateCrm((data) => {
    const meeting: Meeting = {
      id: id(),
      title: input.title.trim(),
      type: input.type ?? "CALL",
      startAt: input.startAt,
      location: input.location,
      description: input.description,
      ownerId: input.ownerId ?? actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      done: false,
      createdAt: now(),
      updatedAt: now(),
    };
    data.meetings.push(meeting);
    if (meeting.entityType && meeting.entityId) {
      log(data, actor, {
        kind: "MEETING",
        entityType: meeting.entityType,
        entityId: meeting.entityId,
        summary: `Встреча запланирована: ${meeting.title}`,
      });
    }
    return meeting;
  });
}

/* -------------------------------- proposals ------------------------------- */

export async function listProposals() {
  const { proposals } = await getCrm();
  return alive(proposals).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createProposal(input: {
  leadId: string;
  title: string;
  services: string[];
  amount: number;
  currency: string;
  timeline?: string;
  description?: string;
}) {
  const actor = await requirePermission("finance.write");

  return mutateCrm((data) => {
    const lead = data.leads.find((l) => l.id === input.leadId);
    if (!lead) throw new Error("Лид не найден.");

    const proposal: Proposal = {
      id: id(),
      leadId: lead.id,
      clientId: lead.clientId,
      title: input.title.trim(),
      services: input.services,
      price: { amount: input.amount, currency: input.currency },
      timeline: input.timeline,
      description: input.description,
      status: "DRAFT",
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: now(),
      updatedAt: now(),
    };
    data.proposals.push(proposal);

    // The proposed price belongs on the lead too — that is what the pipeline
    // totals are built from.
    lead.proposedPrice = proposal.price;
    lead.updatedAt = now();

    log(data, actor, {
      kind: "CREATED",
      entityType: "lead",
      entityId: lead.id,
      summary: `КП подготовлено: ${proposal.title}`,
    });
    return proposal;
  });
}

export async function setProposalStatus(
  proposalId: string,
  status: ProposalStatus,
) {
  const actor = await requirePermission("finance.write");

  return mutateCrm((data) => {
    const proposal = data.proposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error("КП не найдено.");

    const previous = proposal.status;
    proposal.status = status;
    proposal.updatedAt = now();
    if (status === "SENT" && !proposal.sentAt) proposal.sentAt = now();

    log(data, actor, {
      kind: status === "SENT" ? "PROPOSAL_SENT" : "STATUS_CHANGE",
      entityType: "lead",
      entityId: proposal.leadId,
      summary:
        status === "SENT"
          ? `КП отправлено: ${formatAmount(proposal.price)}`
          : `КП «${proposal.title}»: ${previous} → ${status}`,
      from: previous,
      to: status,
    });

    // An accepted proposal moves the deal on by itself.
    const lead = data.leads.find((l) => l.id === proposal.leadId);
    if (lead && status === "ACCEPTED" && lead.stage !== "WON") {
      log(data, actor, {
        kind: "STATUS_CHANGE",
        entityType: "lead",
        entityId: lead.id,
        summary: `Статус: ${lead.stage} → NEGOTIATION`,
        from: lead.stage,
        to: "NEGOTIATION",
      });
      lead.stage = "NEGOTIATION";
      lead.updatedAt = now();
    }

    return proposal;
  });
}

function formatAmount(money: { amount: number; currency: string }) {
  return `${money.amount} ${money.currency}`;
}

/* --------------------------------- finance -------------------------------- */

export async function addPayment(
  projectId: string,
  input: { amount: number; currency: string; paidAt: string; note?: string },
) {
  const actor = await requirePermission("finance.write");

  return mutateCrm((data) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Проект не найден.");

    project.payments.push({
      id: id(),
      amount: input.amount,
      currency: input.currency,
      paidAt: input.paidAt,
      note: input.note,
      createdBy: actor.id,
    });
    project.updatedAt = now();

    log(data, actor, {
      kind: "PAYMENT",
      entityType: "project",
      entityId: project.id,
      summary: `Платёж ${input.amount} ${input.currency}${input.note ? ` — ${input.note}` : ""}`,
    });
    return project;
  });
}

export async function updateClientProject(
  projectId: string,
  patch: Partial<ClientProject>,
) {
  const actor = await requirePermission("project.write");

  return mutateCrm((data) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Проект не найден.");

    const statusChanged = patch.status && patch.status !== project.status;
    const previous = project.status;
    Object.assign(project, patch, { updatedAt: now() });

    if (statusChanged) {
      log(data, actor, {
        kind: "STATUS_CHANGE",
        entityType: "project",
        entityId: project.id,
        summary: `Проект: ${previous} → ${project.status}`,
        from: previous,
        to: project.status,
      });
    }
    return project;
  });
}

export async function addExpense(input: {
  amount: number;
  currency: string;
  paidAt: string;
  category: ExpenseCategory;
  note?: string;
  projectId?: string;
}) {
  const actor = await requirePermission("finance.write");

  return mutateCrm((data) => {
    if (input.projectId && !data.projects.some((p) => p.id === input.projectId)) {
      throw new Error("Проект не найден.");
    }
    const expense: Expense = {
      id: id(),
      amount: input.amount,
      currency: input.currency,
      paidAt: input.paidAt,
      category: input.category,
      note: input.note,
      projectId: input.projectId,
      createdBy: actor.id,
      createdAt: now(),
    };
    data.expenses.push(expense);

    log(data, actor, {
      kind: "EXPENSE",
      entityType: "expense",
      entityId: expense.id,
      summary: `Расход ${formatAmount(input)}${input.note ? ` — ${input.note}` : ""}`,
    });
    return expense;
  });
}

export async function deleteExpense(expenseId: string) {
  const actor = await requirePermission("finance.write");

  return mutateCrm((data) => {
    const expense = data.expenses.find((e) => e.id === expenseId && !e.deletedAt);
    if (!expense) throw new Error("Расход не найден.");
    expense.deletedAt = now();

    log(data, actor, {
      kind: "UPDATED",
      entityType: "expense",
      entityId: expense.id,
      summary: `Расход удалён: ${formatAmount(expense)}`,
    });
    return expense;
  });
}

export interface CurrencyFinance {
  currency: string;
  income: number;
  expenses: number;
  balance: number;
  /** Agreed price of projects minus what has been paid — money owed to us. */
  receivable: number;
  months: { month: string; income: number; expenses: number }[];
  projects: {
    id: string;
    name: string;
    total: number;
    paid: number;
    spent: number;
    remaining: number;
  }[];
}

/**
 * Company-wide money, split by currency — sums and dollars are never added
 * together. The only place these totals are computed besides `projectFinance`.
 */
export async function financeSummary(): Promise<CurrencyFinance[]> {
  await requirePermission("finance.report");
  const { projects, expenses } = await getCrm();
  const liveProjects = alive(projects);
  const liveExpenses = alive(expenses);

  const byCurrency = new Map<string, CurrencyFinance>();
  const bucket = (currency: string) => {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = {
        currency,
        income: 0,
        expenses: 0,
        balance: 0,
        receivable: 0,
        months: [],
        projects: [],
      };
      byCurrency.set(currency, entry);
    }
    return entry;
  };
  const month = (entry: CurrencyFinance, key: string) => {
    let row = entry.months.find((m) => m.month === key);
    if (!row) {
      row = { month: key, income: 0, expenses: 0 };
      entry.months.push(row);
    }
    return row;
  };

  for (const project of liveProjects) {
    const f = projectFinance(project);
    const entry = bucket(f.currency);
    entry.receivable += f.remaining;
    const spent = liveExpenses
      .filter((e) => e.projectId === project.id && e.currency === f.currency)
      .reduce((sum, e) => sum + e.amount, 0);
    entry.projects.push({
      id: project.id,
      name: project.name,
      total: f.total,
      paid: f.paid,
      spent,
      remaining: f.remaining,
    });
    for (const payment of project.payments) {
      const e = bucket(payment.currency);
      e.income += payment.amount;
      month(e, payment.paidAt.slice(0, 7)).income += payment.amount;
    }
  }
  for (const expense of liveExpenses) {
    const e = bucket(expense.currency);
    e.expenses += expense.amount;
    month(e, expense.paidAt.slice(0, 7)).expenses += expense.amount;
  }

  for (const entry of byCurrency.values()) {
    entry.balance = entry.income - entry.expenses;
    entry.months.sort((a, b) => b.month.localeCompare(a.month));
  }
  return [...byCurrency.values()];
}

/** Money summary for one project — the only place these sums are computed. */
export function projectFinance(project: ClientProject) {
  const currency = project.price?.currency ?? project.payments[0]?.currency ?? "UZS";
  const total = project.price?.amount ?? 0;
  const paid = project.payments.reduce((sum, p) => sum + p.amount, 0);
  return { currency, total, paid, remaining: Math.max(total - paid, 0) };
}

/* ------------------------------ notifications ----------------------------- */

export interface Notification {
  id: string;
  text: string;
  href: string;
  tone: "warn" | "info";
}

/**
 * Derived, not stored — the CRM already knows what is late. Keeping these
 * computed means they can never drift from the records they describe.
 */
export async function listNotifications(): Promise<Notification[]> {
  const user = await requirePermission("crm.view");
  const data = await getCrm();
  const today = new Date().toISOString().slice(0, 10);
  const out: Notification[] = [];

  for (const task of visibleTasks(user, data.tasks)) {
    if (task.status === "DONE" || task.status === "CANCELLED") continue;
    if (task.dueAt && task.dueAt.slice(0, 10) < today) {
      const who = can(user.role, "task.assign")
        ? ` (${userName(data, task.ownerId)})`
        : "";
      out.push({
        id: `task-${task.id}`,
        text: `Задача просрочена: ${task.title}${who}`,
        href: "/admin/crm/tasks",
        tone: "warn",
      });
    }
  }

  for (const meeting of alive(data.meetings)) {
    if (meeting.done) continue;
    if (meeting.startAt.slice(0, 10) === today) {
      out.push({
        id: `meeting-${meeting.id}`,
        text: `Сегодня встреча: ${meeting.title}`,
        href: "/admin/crm/meetings",
        tone: "info",
      });
    }
  }

  for (const lead of alive(data.leads)) {
    if (lead.stage === "WON" || lead.stage === "LOST") continue;
    if (lead.nextActionAt && lead.nextActionAt.slice(0, 10) <= today) {
      out.push({
        id: `lead-${lead.id}`,
        text: `${lead.company ?? lead.firstName}: ${lead.nextActionTitle ?? "follow-up"}`,
        href: `/admin/crm/leads/${lead.id}`,
        tone: lead.nextActionAt.slice(0, 10) < today ? "warn" : "info",
      });
    }
  }

  return out.slice(0, 12);
}

/* --------------------------------- search --------------------------------- */

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  href: string;
}

/** One box across the whole CRM: leads, clients, prospects, projects. */
export async function searchCrm(query: string): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const data = await getCrm();
  const hit = (values: (string | undefined)[]) =>
    values.filter(Boolean).some((v) => v!.toLowerCase().includes(needle));

  const out: SearchHit[] = [];

  for (const lead of alive(data.leads)) {
    if (hit([lead.firstName, lead.lastName, lead.company, lead.email, lead.phone, lead.telegram, lead.city])) {
      out.push({
        id: lead.id,
        title: lead.company ?? `${lead.firstName} ${lead.lastName ?? ""}`.trim(),
        subtitle: lead.email ?? lead.phone ?? lead.stage,
        kind: "Лид",
        href: `/admin/crm/leads/${lead.id}`,
      });
    }
  }

  for (const client of alive(data.clients)) {
    if (hit([client.name, client.company, client.email, client.phone, client.city])) {
      out.push({
        id: client.id,
        title: client.company ?? client.name,
        subtitle: client.email ?? client.phone ?? "клиент",
        kind: "Клиент",
        href: "/admin/crm/clients",
      });
    }
  }

  for (const prospect of alive(data.prospects)) {
    if (hit([prospect.company, prospect.contactName, prospect.email, prospect.phone, prospect.city])) {
      out.push({
        id: prospect.id,
        title: prospect.company,
        subtitle: prospect.contactName ?? prospect.service ?? "prospect",
        kind: "Prospect",
        href: "/admin/crm/prospects",
      });
    }
  }

  for (const project of alive(data.projects)) {
    if (hit([project.name, project.description])) {
      out.push({
        id: project.id,
        title: project.name,
        subtitle: project.status,
        kind: "Проект",
        href: "/admin/crm/projects",
      });
    }
  }

  return out.slice(0, 20);
}

/* ---------------------------------- team ---------------------------------- */

export interface TeamMember {
  id: string;
  name: string;
  login: string;
  role: Role;
  active: boolean;
  open: number;
  inProgress: number;
  overdue: number;
  doneLastWeek: number;
}

/** What each person is working on — the admin's view of the whole team. */
export async function teamOverview() {
  await requirePermission("team.view");
  const data = await getCrm();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const tasks = alive(data.tasks);

  const people: Pick<TeamMember, "id" | "name" | "login" | "role" | "active">[] = [
    {
      id: "bootstrap-admin",
      name: "Администратор",
      login: process.env.ADMIN_LOGIN ?? "admin",
      role: "ADMIN",
      active: true,
    },
    ...data.users.map((u) => ({
      id: u.id,
      name: u.name,
      login: u.login,
      role: u.role,
      active: u.active,
    })),
  ];

  const members: TeamMember[] = people.map((person) => {
    const mine = tasks.filter((t) => t.ownerId === person.id);
    const open = mine.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
    return {
      ...person,
      open: open.length,
      inProgress: open.filter((t) => t.status === "IN_PROGRESS").length,
      overdue: open.filter((t) => t.dueAt && t.dueAt.slice(0, 10) < today).length,
      doneLastWeek: mine.filter(
        (t) => t.status === "DONE" && (t.completedAt ?? "") >= weekAgo,
      ).length,
    };
  });

  const feed = [...data.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  return { members, feed };
}

export async function createTeamUser(input: {
  name: string;
  login: string;
  password: string;
  role: Role;
}) {
  const actor = await requirePermission("users.manage");
  if (input.password.length < 8) {
    throw new Error("Пароль должен быть не короче 8 символов.");
  }
  const login = input.login.trim().toLowerCase();
  if (login === (process.env.ADMIN_LOGIN ?? "admin").toLowerCase()) {
    throw new Error("Этот логин занят.");
  }

  const salt = createSalt();
  const passwordHash = await hashPassword(input.password, salt);

  return mutateCrm((data) => {
    if (data.users.some((u) => u.login.toLowerCase() === login)) {
      throw new Error("Этот логин занят.");
    }
    const user: User = {
      id: id(),
      name: input.name.trim(),
      login,
      role: input.role,
      passwordHash,
      passwordSalt: salt,
      active: true,
      createdAt: now(),
    };
    data.users.push(user);
    log(data, actor, {
      kind: "CREATED",
      entityType: "user",
      entityId: user.id,
      summary: `Создан аккаунт: ${user.name} (${user.role})`,
    });
    return user;
  });
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requirePermission("users.manage");

  return mutateCrm((data) => {
    const user = data.users.find((u) => u.id === userId);
    if (!user) throw new Error("Пользователь не найден.");
    user.active = active;
    log(data, actor, {
      kind: "UPDATED",
      entityType: "user",
      entityId: user.id,
      summary: `${active ? "Аккаунт включён" : "Аккаунт отключён"}: ${user.name}`,
    });
    return user;
  });
}
