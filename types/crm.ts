/**
 * CRM domain model.
 *
 * The public-site content (portfolio projects) is a separate concern and keeps
 * living in `types/project.ts`. A *client project* — commercial work we are
 * actually paid to build — is `ClientProject` here and is never mixed with the
 * portfolio entry, though it can point at one once a case study is published.
 */

export const ROLES = ["ADMIN", "SALES", "DEVELOPER"] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "NOT_NOW",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * The stages offered in the interface.
 *
 * Short on purpose: a two-person team selling in one city moves a deal from
 * first contact to a meeting to a price, and the finer gradations were only
 * ever guesses. `LeadStage` keeps the retired values so records written before
 * this still read correctly — see `pipelineColumn`.
 */
export const ACTIVE_LEAD_STAGES: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
  "NOT_NOW",
];

/** The columns of the kanban — the parked stage sits outside it. */
export const PIPELINE_STAGES: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
];

/** Retired stages, and the column a lead in one of them is shown in. */
const FOLDED_INTO: Partial<Record<LeadStage, LeadStage>> = {
  INTERESTED: "CONTACTED",
  NEGOTIATION: "PROPOSAL",
};

/**
 * Where a lead belongs on the board. Without this, a lead saved under a stage
 * that is no longer a column would simply disappear from the funnel.
 */
export function pipelineColumn(stage: LeadStage): LeadStage {
  return FOLDED_INTO[stage] ?? stage;
}

export const PROSPECT_STAGES = [
  "TO_CONTACT",
  "CONTACTED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const SOURCES = [
  "INSTAGRAM",
  "TELEGRAM",
  "WEBSITE",
  "REFERRAL",
  "COLD_CALL",
  "EMAIL",
  "LINKEDIN",
  "PERSONAL",
  "LONDON_OUTREACH",
  "OTHER",
] as const;
export type Source = (typeof SOURCES)[number];

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MEETING_TYPES = ["CALL", "VIDEO", "MEETING", "OTHER"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const ACTIVITY_KINDS = [
  "NOTE",
  "CALL",
  "MEETING",
  "MESSAGE",
  "EMAIL",
  "PROPOSAL_SENT",
  "STATUS_CHANGE",
  "PAYMENT",
  "EXPENSE",
  "TASK_COMPLETED",
  "PROJECT_CREATED",
  "CONVERTED",
  "CREATED",
  "UPDATED",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "NEGOTIATION",
  "ACCEPTED",
  "REJECTED",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const CLIENT_PROJECT_STATUSES = [
  "PLANNING",
  "DESIGN",
  "DEVELOPMENT",
  "TESTING",
  "LAUNCH",
  "COMPLETED",
  "PAUSED",
  "CANCELLED",
] as const;
export type ClientProjectStatus = (typeof CLIENT_PROJECT_STATUSES)[number];

/** What an activity is attached to. */
export type EntityType =
  | "lead"
  | "prospect"
  | "client"
  | "project"
  | "task"
  | "expense"
  | "user";

export interface User {
  id: string;
  name: string;
  login: string;
  role: Role;
  /** PBKDF2 hash; absent for the bootstrap admin, which authenticates by env. */
  passwordHash?: string;
  passwordSalt?: string;
  active: boolean;
  createdAt: string;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface Prospect {
  id: string;
  company: string;
  contactName?: string;
  website?: string;
  instagram?: string;
  telegram?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  service?: string;
  estimatedBudget?: Money;
  source: Source;
  stage: ProspectStage;
  ownerId?: string;
  nextActionTitle?: string;
  nextActionAt?: string;
  notes?: string;
  /** Set once converted, so the trail from prospect to lead is never lost. */
  convertedLeadId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName?: string;
  company?: string;
  position?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  instagram?: string;
  linkedin?: string;
  country?: string;
  city?: string;
  source: Source;
  ownerId?: string;
  stage: LeadStage;
  service?: string;
  description?: string;
  budget?: Money;
  proposedPrice?: Money;
  timeline?: string;
  priority: Priority;
  nextActionTitle?: string;
  nextActionAt?: string;
  notes?: string;
  /** Where it came from, when it started life as a prospect. */
  prospectId?: string;
  /** Set on conversion — a lead is never deleted to make a client. */
  clientId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  telegram?: string;
  country?: string;
  city?: string;
  ownerId?: string;
  leadId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  paidAt: string;
  note?: string;
  createdBy: string;
}

export interface ClientProject {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  status: ClientProjectStatus;
  startDate?: string;
  deadline?: string;
  price?: Money;
  payments: Payment[];
  ownerId?: string;
  team: string[];
  requirements?: string;
  notes?: string;
  leadId?: string;
  /** Slug of the public portfolio entry, if the case was ever published. */
  portfolioSlug?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export const EXPENSE_CATEGORIES = [
  "SALARY",
  "SERVICES",
  "MARKETING",
  "TAXES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Money going out. Income is `Payment` on a project; this is its counterpart. */
export interface Expense {
  id: string;
  amount: number;
  currency: string;
  paidAt: string;
  category: ExpenseCategory;
  note?: string;
  /** Optional: the client project the cost belongs to. */
  projectId?: string;
  createdBy: string;
  createdAt: string;
  deletedAt?: string;
}

export const ATTENDANCE_STATUSES = [
  "UNMARKED",
  "PRESENT",
  "LATE",
  "ABSENT",
  "WARNED",
  "EXCUSED",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ABSENCE_REASONS = [
  "ILLNESS",
  "STUDY_WORK",
  "TECHNICAL",
  "WARNED_EARLIER",
  "PERSONAL",
  "OTHER",
] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export type StandupStatus = "PLANNED" | "HELD" | "CANCELLED";

/** One person's mark on one call. A guest has no `userId`. */
export interface Attendance {
  id: string;
  userId?: string;
  name: string;
  guest?: boolean;
  status: AttendanceStatus;
  reason?: AbsenceReason;
  reasonText?: string;
}

export interface StandupChange {
  id: string;
  at: string;
  actorName: string;
  summary: string;
}

/**
 * A call (a "daily"). Date and time are wall-clock strings — the team sits in
 * one time zone, and a stored instant would shift the hour depending on where
 * the server happens to run.
 */
export interface Standup {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  link?: string;
  status: StandupStatus;
  cancelReason?: string;
  agenda: string;
  notes: string;
  summary: string;
  /** Pinned summaries stay on top of the section after the call. */
  pinned: boolean;
  organizerId: string;
  organizerName: string;
  attendance: Attendance[];
  history: StandupChange[];
  /** Created by the schedule rather than by hand. */
  auto?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface StandupSchedule {
  enabled: boolean;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  time: string;
  title: string;
  link?: string;
  agenda: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueAt?: string;
  /** Sequential key (SDS-12). Filled in on read for tasks that predate it. */
  number?: number;
  /** The client project this task belongs to, if any. */
  projectId?: string;
  /** The call this task came out of. */
  standupId?: string;
  comments?: TaskComment[];
  /** The assignee. Sales and developers only ever see tasks they own. */
  ownerId?: string;
  createdById?: string;
  createdByName?: string;
  entityType?: EntityType;
  entityId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deletedAt?: string;
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  startAt: string;
  location?: string;
  description?: string;
  ownerId?: string;
  entityType?: EntityType;
  entityId?: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Proposal {
  id: string;
  /** A proposal always belongs to a lead — that is where the deal lives. */
  leadId: string;
  clientId?: string;
  title: string;
  services: string[];
  price: Money;
  timeline?: string;
  description?: string;
  status: ProposalStatus;
  sentAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Activity {
  id: string;
  kind: ActivityKind;
  entityType: EntityType;
  entityId: string;
  summary: string;
  detail?: string;
  /** Populated on STATUS_CHANGE so the history reads as a diff. */
  from?: string;
  to?: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

/** The whole CRM, as persisted. One document keeps writes atomic. */
export interface CrmData {
  version: number;
  users: User[];
  prospects: Prospect[];
  leads: Lead[];
  clients: Client[];
  projects: ClientProject[];
  tasks: Task[];
  meetings: Meeting[];
  proposals: Proposal[];
  expenses: Expense[];
  standups: Standup[];
  standupSchedule?: StandupSchedule;
  activities: Activity[];
}

export const emptyCrmData: CrmData = {
  version: 1,
  users: [],
  prospects: [],
  leads: [],
  clients: [],
  projects: [],
  tasks: [],
  meetings: [],
  proposals: [],
  expenses: [],
  standups: [],
  activities: [],
};
