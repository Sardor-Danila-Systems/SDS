import "server-only";
import type { Role } from "@/types/crm";

/*
  Permissions.

  Everything is denied unless listed. Checks run on the server, in the mutation
  itself — hiding a button is presentation, not authorisation.
*/

export const PERMISSIONS = [
  "crm.view",
  "prospect.write",
  "prospect.delete",
  "lead.write",
  "lead.delete",
  "client.write",
  "client.delete",
  "task.write",
  "meeting.write",
  "project.write",
  "finance.view",
  "finance.write",
  "finance.report",
  "task.assign",
  "team.view",
  "content.write",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const BY_ROLE: Record<Role, Permission[]> = {
  ADMIN: [...PERMISSIONS],

  // Sales runs the funnel end to end but does not remove records — a lost
  // deal is a stage, not a deletion — and does not change money.
  SALES: [
    "crm.view",
    "prospect.write",
    "lead.write",
    "client.write",
    "task.write",
    "meeting.write",
    "finance.view",
  ],

  // Developers see the work assigned to them, not the commercials.
  DEVELOPER: ["crm.view", "task.write", "project.write"],
};

export function can(role: Role, permission: Permission): boolean {
  return BY_ROLE[role]?.includes(permission) ?? false;
}

/** Roles that must never see money. Used to strip fields before they render. */
export function canSeeFinance(role: Role): boolean {
  return can(role, "finance.view");
}
