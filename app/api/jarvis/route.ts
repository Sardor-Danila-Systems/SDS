import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser, listAssignableUsers, type SessionUser } from "@/lib/auth";
import { can, canSeeFinance, PERMISSIONS, type Permission } from "@/lib/crm/rbac";
import {
  AuthzError,
  activitiesFor,
  addExpense,
  addLeadActivity,
  addPayment,
  addTaskComment,
  createClientProject,
  convertLeadToClient,
  convertProspectToLead,
  createLead,
  createMeeting,
  createProspect,
  createTask,
  financeSummary,
  listClients,
  listLeads,
  listMeetings,
  listNotifications,
  listProjects,
  listProspects,
  listTasks,
  projectFinance,
  searchCrm,
  teamOverview,
  updateClientProject,
  updateLead,
  updateProspect,
  updateTask,
} from "@/lib/crm/repo";
import {
  createStandup,
  createStandupTask,
  listStandups,
  markAllPresent,
  saveSummary,
  setAttendance,
  updateStandupText,
  wallNow,
} from "@/lib/crm/standups";
import { PERIODS, buildPerformance, type Period } from "@/lib/performance";
import { buildPersonDetail } from "@/lib/performance/person";
import { CrmStoreError } from "@/lib/crm/store";
import {
  ABSENCE_REASONS,
  ATTENDANCE_STATUSES,
  CLIENT_PROJECT_STATUSES,
  EXPENSE_CATEGORIES,
  LEAD_STAGES,
  MEETING_TYPES,
  PRIORITIES,
  PROSPECT_STAGES,
  SOURCES,
  TASK_STATUSES,
  type ActivityKind,
  type ClientProject,
  type Lead,
  type Meeting,
  type Money,
  type Prospect,
  type Task,
} from "@/types/crm";

/*
  API for Jarvis, Sardor's AI assistant.

  GET  /api/jarvis               → who Jarvis is here and which operations it may run
  POST /api/jarvis {op, ...args} → run one operation

  Authorization: `Bearer <JARVIS_API_TOKEN>`; the rights are the role of the
  CRM account `JARVIS_LOGIN` (see lib/auth.ts). Every operation goes through
  lib/crm/repo, so permissions, the activity log and serialised writes are the
  same as in the admin UI.

  Deliberately absent: deleting anything, accounts and passwords, the public
  site's content. Those stay with people. Money (payments, expenses, prices)
  needs finance.write, and Jarvis's own rules allow it only on Sardor's word.
*/

class InputError extends Error {}

type Args = Record<string, unknown>;

interface Operation {
  /** What it does, in the words Jarvis will repeat to Sardor. */
  about: string;
  needs: Permission;
  write?: boolean;
  run: (args: Args, user: SessionUser) => Promise<unknown>;
}

/* --------------------------------- inputs --------------------------------- */

function str(args: Args, key: string, max = 2000): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new InputError(`${key}: нужна строка`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new InputError(`${key}: не длиннее ${max} символов`);
  return trimmed || undefined;
}

function required(args: Args, key: string, max = 2000): string {
  const value = str(args, key, max);
  if (!value) throw new InputError(`${key}: обязательно`);
  return value;
}

function oneOf<T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined {
  const value = str(args, key, 40);
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new InputError(`${key}: одно из ${allowed.join(", ")}`);
  }
  return value as T;
}

/** A date (YYYY-MM-DD) or a moment with an offset (2026-11-14T15:00:00+05:00). */
function when(args: Args, key: string): string | undefined {
  const value = str(args, key, 40);
  if (value === undefined) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    throw new InputError(`${key}: дата ГГГГ-ММ-ДД или время с поясом, например 2026-11-14T15:00:00+05:00`);
  }
  return parsed.toISOString();
}

function day(args: Args, key: string): string | undefined {
  const value = str(args, key, 10);
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError(`${key}: дата ГГГГ-ММ-ДД`);
  return value;
}

function period(args: Args): Period {
  const days = Number(args.days ?? 30);
  if (!(PERIODS as readonly number[]).includes(days)) throw new InputError(`days: одно из ${PERIODS.join(", ")}`);
  return days as Period;
}

function amount(args: Args, key: string): number {
  const value = Number(args[key]);
  if (!Number.isFinite(value) || value <= 0) throw new InputError(`${key}: положительное число`);
  return value;
}

function money(args: Args, key: string): Money | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  const object = value as { amount?: unknown; currency?: unknown };
  const amount = Number(object.amount);
  if (typeof value !== "object" || !Number.isFinite(amount) || amount <= 0) {
    throw new InputError(`${key}: {"amount": число, "currency": "USD" | "UZS"}`);
  }
  const currency = typeof object.currency === "string" ? object.currency.trim().toUpperCase() : "USD";
  return { amount, currency: currency || "USD" };
}

/** Only the named fields, so an operation can never touch ids, links or history. */
function pick(args: Args, fields: Record<string, (args: Args, key: string) => unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(fields)) {
    if (key in args) patch[key] = read(args, key);
  }
  if (Object.keys(patch).length === 0) {
    throw new InputError(`нечего менять: поля ${Object.keys(fields).join(", ")}`);
  }
  return patch;
}

const LEAD_FIELDS = {
  firstName: str, lastName: str, company: str, position: str, phone: str, email: str,
  telegram: str, instagram: str, linkedin: str, country: str, city: str, service: str,
  description: (a: Args, k: string) => str(a, k, 5000), notes: (a: Args, k: string) => str(a, k, 5000),
  timeline: str, nextActionTitle: str, nextActionAt: when, ownerId: str,
  source: (a: Args, k: string) => oneOf(a, k, SOURCES),
  priority: (a: Args, k: string) => oneOf(a, k, PRIORITIES),
  stage: (a: Args, k: string) => oneOf(a, k, LEAD_STAGES),
  budget: money, proposedPrice: money,
};

const PROSPECT_FIELDS = {
  company: str, contactName: str, website: str, instagram: str, telegram: str, email: str,
  phone: str, country: str, city: str, service: str, notes: (a: Args, k: string) => str(a, k, 5000),
  nextActionTitle: str, nextActionAt: when, ownerId: str,
  source: (a: Args, k: string) => oneOf(a, k, SOURCES),
  stage: (a: Args, k: string) => oneOf(a, k, PROSPECT_STAGES),
  estimatedBudget: money,
};

const ACTIVITY_KINDS: ActivityKind[] = ["NOTE", "CALL", "MEETING", "MESSAGE", "EMAIL", "PROPOSAL_SENT"];

/* -------------------------------- outputs --------------------------------- */

const limitOf = (args: Args) => Math.min(Math.max(Number(args.limit) || 50, 1), 200);

function matches(args: Args, ...values: (string | undefined)[]) {
  const query = typeof args.q === "string" ? args.q.trim().toLowerCase() : "";
  return !query || values.some((v) => v?.toLowerCase().includes(query));
}

const leadView = (lead: Lead, money: boolean) => ({
  id: lead.id,
  name: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
  company: lead.company,
  stage: lead.stage,
  source: lead.source,
  priority: lead.priority,
  service: lead.service,
  ...(money ? { budget: lead.budget, proposedPrice: lead.proposedPrice } : {}),
  phone: lead.phone,
  telegram: lead.telegram,
  email: lead.email,
  nextActionTitle: lead.nextActionTitle,
  nextActionAt: lead.nextActionAt,
  ownerId: lead.ownerId,
  clientId: lead.clientId,
  updatedAt: lead.updatedAt,
});

const prospectView = (p: Prospect, money: boolean) => ({
  id: p.id,
  company: p.company,
  contactName: p.contactName,
  stage: p.stage,
  service: p.service,
  ...(money ? { estimatedBudget: p.estimatedBudget } : {}),
  website: p.website,
  telegram: p.telegram,
  phone: p.phone,
  nextActionTitle: p.nextActionTitle,
  nextActionAt: p.nextActionAt,
  convertedLeadId: p.convertedLeadId,
  updatedAt: p.updatedAt,
});

const taskView = (t: Task) => ({
  id: t.id,
  key: t.number ? `SDS-${t.number}` : undefined,
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueAt: t.dueAt,
  ownerId: t.ownerId,
  projectId: t.projectId,
  standupId: t.standupId,
  updatedAt: t.updatedAt,
});

const meetingView = (m: Meeting) => ({
  id: m.id,
  title: m.title,
  type: m.type,
  startAt: m.startAt,
  location: m.location,
  done: m.done,
  leadId: m.entityType === "lead" ? m.entityId : undefined,
});

const projectView = (p: ClientProject, money: boolean) => {
  const finance = money ? projectFinance(p) : null;
  return {
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    status: p.status,
    deadline: p.deadline,
    ownerId: p.ownerId,
    ...(finance ? { price: p.price, finance } : {}),
  };
};

/* ------------------------------- operations ------------------------------- */

const OPERATIONS: Record<string, Operation> = {
  today: {
    about: "сводка на сегодня: просроченное и сегодняшнее, встречи, следующие шаги по лидам, новые заявки с сайта",
    needs: "crm.view",
    run: async (_args, user) => {
      const { date } = wallNow();
      const money = canSeeFinance(user.role);
      const open = (lead: Lead) => lead.stage !== "WON" && lead.stage !== "LOST";
      const [notifications, leads, tasks, meetings] = await Promise.all([
        listNotifications(), listLeads(), listTasks(), listMeetings(),
      ]);
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
      return {
        date,
        notifications: notifications.map((n) => n.text),
        leadsDue: leads
          .filter((l) => open(l) && l.nextActionAt && l.nextActionAt.slice(0, 10) <= date)
          .map((l) => leadView(l, money)),
        newWebsiteLeads: leads
          .filter((l) => l.source === "WEBSITE" && l.stage === "NEW" && l.createdAt >= threeDaysAgo)
          .map((l) => leadView(l, money)),
        tasksDue: tasks
          .filter((t) => t.status !== "DONE" && t.status !== "CANCELLED" && t.dueAt && t.dueAt.slice(0, 10) <= date)
          .map(taskView),
        meetingsToday: meetings.filter((m) => !m.done && m.startAt.slice(0, 10) === date).map(meetingView),
      };
    },
  },
  search: {
    about: "поиск по лидам, клиентам, компаниям и проектам (q)",
    needs: "crm.view",
    run: async (args) => searchCrm(required(args, "q", 100)),
  },
  "prospects.list": {
    about: "«Кому написать»: компании до первого ответа (фильтры q, stage, limit)",
    needs: "crm.view",
    run: async (args, user) => {
      const stage = oneOf(args, "stage", PROSPECT_STAGES);
      return (await listProspects())
        .filter((p) => (!stage || p.stage === stage) && matches(args, p.company, p.contactName, p.service))
        .slice(0, limitOf(args))
        .map((p) => prospectView(p, canSeeFinance(user.role)));
    },
  },
  "leads.list": {
    about: "лиды (фильтры q, stage, limit)",
    needs: "crm.view",
    run: async (args, user) => {
      const stage = oneOf(args, "stage", LEAD_STAGES);
      return (await listLeads())
        .filter((l) => (!stage || l.stage === stage) && matches(args, l.firstName, l.lastName, l.company, l.service))
        .slice(0, limitOf(args))
        .map((l) => leadView(l, canSeeFinance(user.role)));
    },
  },
  "lead.get": {
    about: "карточка лида целиком, с историей (id)",
    needs: "crm.view",
    run: async (args, user) => {
      const leadId = required(args, "id", 80);
      const lead = (await listLeads()).find((l) => l.id === leadId);
      if (!lead) throw new InputError("лид не найден");
      const history = (await activitiesFor("lead", leadId)).slice(0, 30).map((a) => ({
        at: a.createdAt, kind: a.kind, summary: a.summary, detail: a.detail, by: a.actorName,
      }));
      const money = canSeeFinance(user.role);
      return { ...leadView(lead, money), description: lead.description, notes: lead.notes, timeline: lead.timeline, history };
    },
  },
  "clients.list": {
    about: "клиенты (фильтр q)",
    needs: "crm.view",
    run: async (args) =>
      (await listClients())
        .filter((c) => matches(args, c.name, c.company))
        .slice(0, limitOf(args))
        .map((c) => ({ id: c.id, name: c.name, company: c.company, phone: c.phone, telegram: c.telegram, email: c.email, leadId: c.leadId })),
  },
  "projects.list": {
    about: "проекты клиентов: статус, срок, а для ролей с доступом к суммам — цена, оплачено, остаток",
    needs: "crm.view",
    run: async (args, user) =>
      (await listProjects())
        .filter((p) => matches(args, p.name))
        .slice(0, limitOf(args))
        .map((p) => projectView(p, canSeeFinance(user.role))),
  },
  "tasks.list": {
    about: "задачи трекера (фильтры status, ownerId, q); роль без «задач всей команды» видит только свои",
    needs: "crm.view",
    run: async (args) => {
      const status = oneOf(args, "status", TASK_STATUSES);
      const owner = str(args, "ownerId", 80);
      return (await listTasks())
        .filter((t) => (!status || t.status === status) && (!owner || t.ownerId === owner) && matches(args, t.title))
        .slice(0, limitOf(args))
        .map(taskView);
    },
  },
  "meetings.list": {
    about: "встречи (upcoming=true — только предстоящие)",
    needs: "crm.view",
    run: async (args) => {
      const now = new Date().toISOString();
      return (await listMeetings())
        .filter((m) => (args.upcoming ? !m.done && m.startAt >= now : true))
        .slice(0, limitOf(args))
        .map(meetingView);
    },
  },
  team: {
    about: "команда: открытые и просроченные задачи у каждого, лента последних действий",
    needs: "team.view",
    run: async () => {
      const { members, feed } = await teamOverview();
      return {
        members,
        feed: feed.slice(0, 20).map((a) => ({ at: a.createdAt, by: a.actorName, summary: a.summary })),
      };
    },
  },
  "standups.list": {
    about: "созвоны: дата, тема, статус, кто был (с id отметок), заметки и итоги",
    needs: "standup.manage",
    run: async (args) =>
      (await listStandups()).slice(0, Math.min(limitOf(args), 20)).map((s) => ({
        id: s.id, title: s.title, date: s.date, time: s.time, status: s.status, link: s.link,
        notes: s.notes, summary: s.summary,
        attendance: s.attendance.map((a) => ({
          entryId: a.id, userId: a.userId, name: a.name, status: a.status, reason: a.reason ?? a.reasonText,
        })),
      })),
  },
  "users.list": {
    about: "сотрудники, которым можно назначать задачи и лиды (id, имя, логин, роль)",
    needs: "crm.view",
    run: async () => listAssignableUsers(),
  },
  performance: {
    about: "перформанс команды за 7, 30 или 90 дней (days): коммиты, PR, задачи Jira, часы, последняя активность",
    needs: "team.view",
    run: async (args) => buildPerformance(period(args)),
  },
  "performance.person": {
    about: "подробно по человеку (name — как на странице «Перформанс», days): цикл задач, возвраты, просрочки, PR, репозитории",
    needs: "team.view",
    run: async (args) => buildPersonDetail(required(args, "name", 80), period(args)),
  },
  finance: {
    about: "финансы по валютам: получено, расходы, баланс, долги клиентов",
    needs: "finance.report",
    run: async () => financeSummary(),
  },

  "prospect.create": {
    about: "добавить компанию в «Кому написать» (company обязательно; contactName, telegram, phone, website, service, estimatedBudget, source, nextActionTitle, nextActionAt, notes)",
    needs: "prospect.write",
    write: true,
    run: async (args) => {
      const fields = pick(args, PROSPECT_FIELDS) as Partial<Prospect>;
      const company = required(args, "company", 200);
      const created = await createProspect({ ...fields, company, source: fields.source ?? "OTHER" });
      return { id: created.id };
    },
  },
  "prospect.update": {
    about: "изменить компанию из «Кому написать» (id + поля, stage — этап)",
    needs: "prospect.write",
    write: true,
    run: async (args) => {
      const prospectId = required(args, "id", 80);
      const patch = pick(args, PROSPECT_FIELDS) as Partial<Prospect>;
      const updated = await updateProspect(prospectId, patch);
      return { id: prospectId, stage: (updated as Prospect | undefined)?.stage };
    },
  },
  "prospect.convert": {
    about: "компания ответила — перевести в лиды (id)",
    needs: "lead.write",
    write: true,
    run: async (args) => {
      const lead = await convertProspectToLead(required(args, "id", 80));
      return { leadId: (lead as { id?: string } | undefined)?.id };
    },
  },
  "lead.create": {
    about: "новый лид (firstName обязательно; company, phone, telegram, email, service, description, budget, source, priority, nextActionTitle, nextActionAt)",
    needs: "lead.write",
    write: true,
    run: async (args) => {
      const fields = pick(args, LEAD_FIELDS) as Partial<Lead>;
      const firstName = required(args, "firstName", 120);
      const created = await createLead({
        ...fields, firstName, source: fields.source ?? "OTHER", priority: fields.priority ?? "MEDIUM",
      });
      return { id: created.id };
    },
  },
  "lead.update": {
    about: "изменить лид (id + поля: этап stage, следующий шаг nextActionTitle/nextActionAt, цена proposedPrice, заметки notes…)",
    needs: "lead.write",
    write: true,
    run: async (args) => {
      const leadId = required(args, "id", 80);
      const patch = pick(args, LEAD_FIELDS) as Partial<Lead>;
      const updated = await updateLead(leadId, patch);
      return { id: leadId, stage: updated.stage, nextActionAt: updated.nextActionAt };
    },
  },
  "lead.note": {
    about: "записать в историю лида звонок, встречу, сообщение или заметку (id, kind, summary, detail)",
    needs: "lead.write",
    write: true,
    run: async (args) => {
      const entry = await addLeadActivity(required(args, "id", 80), {
        kind: oneOf(args, "kind", ACTIVITY_KINDS) ?? "NOTE",
        summary: required(args, "summary", 300),
        detail: str(args, "detail", 5000),
      });
      return { id: entry.id };
    },
  },
  "lead.convert": {
    about: "сделка выиграна — перевести лид в клиенты (id)",
    needs: "client.write",
    write: true,
    run: async (args) => {
      const client = await convertLeadToClient(required(args, "id", 80));
      return { clientId: (client as { id?: string } | undefined)?.id };
    },
  },
  "task.create": {
    about: "задача в трекер (title обязательно; description, priority, dueAt, ownerId — кому, projectId, leadId)",
    needs: "task.write",
    write: true,
    run: async (args) => {
      const leadId = str(args, "leadId", 80);
      const task = await createTask({
        title: required(args, "title", 200),
        description: str(args, "description", 5000),
        priority: oneOf(args, "priority", PRIORITIES) ?? "MEDIUM",
        dueAt: when(args, "dueAt"),
        ownerId: str(args, "ownerId", 80),
        projectId: str(args, "projectId", 80),
        entityType: leadId ? "lead" : undefined,
        entityId: leadId,
      });
      return { id: task.id, key: `SDS-${task.number}` };
    },
  },
  "task.update": {
    about: "изменить задачу (id + title, description, status, priority, dueAt, projectId)",
    needs: "task.write",
    write: true,
    run: async (args) => {
      const taskId = required(args, "id", 80);
      const patch = pick(args, {
        title: str, description: (a: Args, k: string) => str(a, k, 5000),
        status: (a: Args, k: string) => oneOf(a, k, TASK_STATUSES),
        priority: (a: Args, k: string) => oneOf(a, k, PRIORITIES),
        dueAt: when, projectId: str,
      }) as Partial<Task>;
      const updated = await updateTask(taskId, patch);
      return { id: taskId, status: (updated as Task | undefined)?.status };
    },
  },
  "task.comment": {
    about: "комментарий к задаче (id, text)",
    needs: "task.write",
    write: true,
    run: async (args) => {
      const comment = await addTaskComment(required(args, "id", 80), required(args, "text", 2000));
      return { id: (comment as { id?: string } | undefined)?.id };
    },
  },
  "task.assign": {
    about: "назначить задачу другому сотруднику (id, ownerId из users.list)",
    needs: "task.assign",
    write: true,
    run: async (args) => {
      const updated = await updateTask(required(args, "id", 80), { ownerId: required(args, "ownerId", 80) });
      return { id: (updated as Task | undefined)?.id, ownerId: (updated as Task | undefined)?.ownerId };
    },
  },
  "project.create": {
    about: "проект клиента (clientId, name; leadId, description, deadline, requirements; price — только с правом на деньги)",
    needs: "project.write",
    write: true,
    run: async (args, user) => {
      const price = money(args, "price");
      if (price && !can(user.role, "finance.write")) throw new AuthzError("Цену проекта меняет только тот, кому можно деньги.");
      const project = await createClientProject({
        clientId: required(args, "clientId", 80),
        name: required(args, "name", 200),
        leadId: str(args, "leadId", 80),
        description: str(args, "description", 5000),
        deadline: day(args, "deadline"),
        requirements: str(args, "requirements", 5000),
        price,
      });
      return { id: project.id };
    },
  },
  "project.update": {
    about: "изменить проект (id + status, deadline, name, description, requirements, notes; price — с правом на деньги)",
    needs: "project.write",
    write: true,
    run: async (args) => {
      const projectId = required(args, "id", 80);
      const patch = pick(args, {
        name: str, description: (a: Args, k: string) => str(a, k, 5000),
        requirements: (a: Args, k: string) => str(a, k, 5000), notes: (a: Args, k: string) => str(a, k, 5000),
        status: (a: Args, k: string) => oneOf(a, k, CLIENT_PROJECT_STATUSES),
        deadline: day, price: money,
      }) as Partial<ClientProject>;
      const updated = await updateClientProject(projectId, patch);
      return { id: projectId, status: updated.status, deadline: updated.deadline };
    },
  },
  "payment.add": {
    about: "оплата от клиента по проекту (projectId, amount, currency, paidAt ГГГГ-ММ-ДД, note) — только по слову Сардора",
    needs: "finance.write",
    write: true,
    run: async (args) => {
      const payment = await addPayment(required(args, "projectId", 80), {
        amount: amount(args, "amount"),
        currency: (str(args, "currency", 10) ?? "USD").toUpperCase(),
        paidAt: day(args, "paidAt") ?? wallNow().date,
        note: str(args, "note", 500),
      });
      return { id: (payment as { id?: string } | undefined)?.id };
    },
  },
  "expense.add": {
    about: "расход (amount, currency, paidAt, category SALARY/SERVICES/MARKETING/TAXES/OTHER, note, projectId) — только по слову Сардора",
    needs: "finance.write",
    write: true,
    run: async (args) => {
      const expense = await addExpense({
        amount: amount(args, "amount"),
        currency: (str(args, "currency", 10) ?? "UZS").toUpperCase(),
        paidAt: day(args, "paidAt") ?? wallNow().date,
        category: oneOf(args, "category", EXPENSE_CATEGORIES) ?? "OTHER",
        note: str(args, "note", 500),
        projectId: str(args, "projectId", 80),
      });
      return { id: (expense as { id?: string } | undefined)?.id };
    },
  },
  "standup.create": {
    about: "созвон (title, date ГГГГ-ММ-ДД, time ЧЧ:ММ по Ташкенту, link, agenda)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      const time = required(args, "time", 5);
      if (!/^\d{2}:\d{2}$/.test(time)) throw new InputError("time: ЧЧ:ММ");
      const standup = await createStandup({
        title: required(args, "title", 200),
        date: day(args, "date") ?? wallNow().date,
        time,
        link: str(args, "link", 500),
        agenda: str(args, "agenda", 5000),
      });
      return { id: standup.id };
    },
  },
  "standup.notes": {
    about: "тема, ссылка, повестка или заметки созвона (id + title, link, agenda, notes)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      const patch = pick(args, {
        title: str, link: str,
        agenda: (a: Args, k: string) => str(a, k, 5000), notes: (a: Args, k: string) => str(a, k, 10000),
      }) as { title?: string; link?: string; agenda?: string; notes?: string };
      await updateStandupText(required(args, "id", 80), patch);
      return { id: args.id };
    },
  },
  "standup.summary": {
    about: "итоги созвона (id, summary; pinned — закрепить; finish — отметить проведённым)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      await saveSummary(required(args, "id", 80), {
        summary: required(args, "summary", 10000),
        pinned: args.pinned === true || args.pinned === "true",
        finish: args.finish === true || args.finish === "true",
      });
      return { id: args.id };
    },
  },
  "standup.attendance": {
    about: "отметка участника (id созвона, entryId из standups.list, status PRESENT/LATE/ABSENT/WARNED/EXCUSED, reason, reasonText)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      const status = oneOf(args, "status", ATTENDANCE_STATUSES);
      if (!status) throw new InputError("status: обязательно");
      await setAttendance(required(args, "id", 80), required(args, "entryId", 80), {
        status,
        reason: oneOf(args, "reason", ABSENCE_REASONS),
        reasonText: str(args, "reasonText", 300),
      });
      return { id: args.id };
    },
  },
  "standup.present": {
    about: "отметить всех неотмеченных как присутствовавших (id)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      await markAllPresent(required(args, "id", 80));
      return { id: args.id };
    },
  },
  "standup.task": {
    about: "задача после созвона, попадает в трекер (id созвона, title, ownerId, dueAt, description, priority)",
    needs: "standup.manage",
    write: true,
    run: async (args) => {
      const task = await createStandupTask(required(args, "id", 80), {
        title: required(args, "title", 200),
        ownerId: str(args, "ownerId", 80),
        dueAt: when(args, "dueAt"),
        description: str(args, "description", 5000),
        priority: oneOf(args, "priority", PRIORITIES),
      });
      return { id: task.id, key: `SDS-${task.number}` };
    },
  },
  "meeting.create": {
    about: "встреча (title, startAt с поясом; type CALL/VIDEO/MEETING/OTHER, location, description, leadId)",
    needs: "meeting.write",
    write: true,
    run: async (args) => {
      const leadId = str(args, "leadId", 80);
      const startAt = when(args, "startAt");
      if (!startAt || startAt.length === 10) throw new InputError("startAt: время с поясом, например 2026-11-14T15:00:00+05:00");
      const meeting = await createMeeting({
        title: required(args, "title", 200),
        startAt,
        type: oneOf(args, "type", MEETING_TYPES) ?? "MEETING",
        location: str(args, "location", 300),
        description: str(args, "description", 5000),
        entityType: leadId ? "lead" : undefined,
        entityId: leadId,
      });
      return { id: meeting.id };
    },
  },
};

/* -------------------------------- handlers -------------------------------- */

function failure(error: unknown) {
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof AuthzError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof CrmStoreError) return NextResponse.json({ error: error.message }, { status: 503 });
  const message = error instanceof Error ? error.message : "Не удалось выполнить.";
  return NextResponse.json({ error: message }, { status: 422 });
}

const UNAUTHORIZED = NextResponse.json(
  { error: "Нужен ключ Jarvis (Authorization: Bearer …) и активный аккаунт Jarvis в «Команде»." },
  { status: 401 },
);

/** Who Jarvis is here and what it may do — the answer to "what can you do in the admin?". */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;
  return NextResponse.json({
    user: { id: user.id, name: user.name, login: user.login, role: user.role },
    permissions: PERMISSIONS.filter((p) => can(user.role, p)),
    operations: Object.entries(OPERATIONS).map(([op, o]) => ({
      op, about: o.about, write: Boolean(o.write), allowed: can(user.role, o.needs),
    })),
    notAvailable: "удаление, аккаунты и пароли, контент сайта — только люди в админке",
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  let args: Args;
  try {
    args = (await request.json()) as Args;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Тело запроса — JSON-объект {\"op\": …}" }, { status: 400 });
  }
  const op = typeof args.op === "string" ? args.op : "";
  const operation = OPERATIONS[op];
  if (!operation) {
    return NextResponse.json({ error: `Нет операции «${op}». Список — GET /api/jarvis.` }, { status: 404 });
  }
  if (!can(user.role, operation.needs)) {
    return NextResponse.json({ error: `Роли ${user.role} это недоступно (нужно ${operation.needs}).` }, { status: 403 });
  }

  try {
    const result = await operation.run(args, user);
    if (operation.write) revalidatePath("/admin", "layout");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return failure(error);
  }
}
