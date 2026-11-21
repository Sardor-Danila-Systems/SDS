import type { CrmData } from "@/types/crm";

/*
  The CRM as real tables.

  Every entity is one table: a column per flat field (so the data can be
  queried, joined and indexed), `jsonb` for the nested parts (payments, team,
  attendance…) and an `extra` column that keeps any field this file does not
  know about — nothing a record carries is ever dropped on the way through.

  Timestamps stay ISO strings (`text`), exactly as the application writes and
  compares them; changing their type would change every caller.
*/

type Kind = "text" | "num" | "bool" | "json";

interface Field {
  /** Property name on the entity. */
  key: string;
  kind: Kind;
  /** Column name, when it can't be the snake_case of `key` (reserved words). */
  col?: string;
}

const t = (...keys: string[]): Field[] => keys.map((key) => ({ key, kind: "text" }));
const j = (...keys: string[]): Field[] => keys.map((key) => ({ key, kind: "json" }));
const b = (...keys: string[]): Field[] => keys.map((key) => ({ key, kind: "bool" }));
const n = (...keys: string[]): Field[] => keys.map((key) => ({ key, kind: "num" }));

export interface TableSpec {
  /** Property on `CrmData` that holds the array. */
  prop: keyof CrmData;
  table: string;
  fields: Field[];
  indexes?: string[][];
}

export const TABLES: TableSpec[] = [
  {
    prop: "users",
    table: "crm_users",
    fields: [...t("name", "login", "role", "passwordHash", "passwordSalt"), ...b("active"), ...t("createdAt")],
    indexes: [["login"]],
  },
  {
    prop: "prospects",
    table: "crm_prospects",
    fields: [
      ...t("company", "contactName", "website", "instagram", "telegram", "email", "phone", "country", "city", "service"),
      ...j("estimatedBudget"),
      ...t("source", "stage", "ownerId", "nextActionTitle", "nextActionAt", "notes", "convertedLeadId", "createdAt", "updatedAt", "deletedAt"),
    ],
    indexes: [["stage"], ["ownerId"]],
  },
  {
    prop: "leads",
    table: "crm_leads",
    fields: [
      ...t("firstName", "lastName", "company", "position", "phone", "email", "telegram", "instagram", "linkedin", "country", "city", "source", "ownerId", "stage", "service", "description"),
      ...j("budget", "proposedPrice"),
      ...t("timeline", "priority", "nextActionTitle", "nextActionAt", "notes", "prospectId", "clientId", "createdAt", "updatedAt", "deletedAt"),
    ],
    indexes: [["stage"], ["ownerId"]],
  },
  {
    prop: "clients",
    table: "crm_clients",
    fields: t("name", "company", "email", "phone", "telegram", "country", "city", "ownerId", "leadId", "notes", "createdAt", "updatedAt", "deletedAt"),
  },
  {
    prop: "projects",
    table: "crm_projects",
    fields: [
      ...t("clientId", "name", "description", "status", "startDate", "deadline"),
      ...j("price", "payments"),
      ...t("ownerId"),
      ...j("team"),
      ...t("requirements", "notes", "leadId", "portfolioSlug", "createdAt", "updatedAt", "deletedAt"),
    ],
    indexes: [["clientId"]],
  },
  {
    prop: "tasks",
    table: "crm_tasks",
    fields: [
      ...t("title", "description", "status", "priority", "dueAt"),
      ...n("number"),
      ...t("projectId", "standupId"),
      ...j("comments"),
      ...t("ownerId", "createdById", "createdByName", "entityType", "entityId", "createdAt", "updatedAt", "completedAt", "deletedAt"),
    ],
    indexes: [["ownerId"], ["projectId"], ["status"]],
  },
  {
    prop: "meetings",
    table: "crm_meetings",
    fields: [...t("title", "type", "startAt", "location", "description", "ownerId", "entityType", "entityId"), ...b("done"), ...t("createdAt", "updatedAt", "deletedAt")],
  },
  {
    prop: "proposals",
    table: "crm_proposals",
    fields: [
      ...t("leadId", "clientId", "title"),
      ...j("services", "price"),
      ...t("timeline", "description", "status", "sentAt", "createdBy", "createdByName", "createdAt", "updatedAt", "deletedAt"),
    ],
    indexes: [["leadId"]],
  },
  {
    prop: "expenses",
    table: "crm_expenses",
    fields: [...n("amount"), ...t("currency", "paidAt", "category", "note", "projectId", "createdBy", "createdAt", "deletedAt")],
  },
  {
    prop: "standups",
    table: "crm_standups",
    fields: [
      ...t("title", "date", "time", "link", "status", "cancelReason", "agenda", "notes", "summary"),
      ...b("pinned"),
      ...t("organizerId", "organizerName"),
      ...j("attendance", "history"),
      ...b("auto"),
      ...t("createdAt", "updatedAt", "deletedAt"),
    ],
    indexes: [["date"]],
  },
  {
    prop: "activities",
    table: "crm_activities",
    fields: [
      ...t("kind", "entityType", "entityId", "summary", "detail"),
      { key: "from", kind: "text", col: "from_value" },
      { key: "to", kind: "text", col: "to_value" },
      ...t("actorId", "actorName", "createdAt"),
    ],
    indexes: [["entityType", "entityId"]],
  },
];

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const column = (f: Field) => f.col ?? snake(f.key);
const sqlType: Record<Kind, string> = { text: "text", num: "double precision", bool: "boolean", json: "jsonb" };

/** Key/value rows for what is not a list: the document version and the standup schedule. */
export const SETTINGS_TABLE = "crm_settings";

export const SCHEMA_SQL: string[] = [
  `create table if not exists ${SETTINGS_TABLE} (key text primary key, value jsonb not null)`,
  ...TABLES.flatMap((spec) => [
    `create table if not exists ${spec.table} (
      id text primary key,
      seq bigserial,
      ${spec.fields.map((f) => `${column(f)} ${sqlType[f.kind]}`).join(",\n      ")},
      extra jsonb
    )`,
    ...(spec.indexes ?? []).map(
      (cols) => `create index if not exists ${spec.table}_${cols.map((c) => snake(c)).join("_")}_idx on ${spec.table} (${cols.map((c) => snake(c)).join(", ")})`,
    ),
  ]),
  `create table if not exists portfolio_projects (
    id integer primary key,
    slug text not null unique,
    title text not null,
    kind text not null,
    glyph text not null,
    href text,
    domain text,
    year text,
    featured boolean not null default false,
    span text not null default 'half',
    cover jsonb,
    images jsonb not null default '[]',
    technologies jsonb not null default '[]',
    i18n jsonb not null default '{}',
    extra jsonb
  )`,
];

type Row = Record<string, unknown>;

const KNOWN = (spec: TableSpec) => new Set(["id", ...spec.fields.map((f) => f.key)]);

/** Entity → column values, in the order of `columns(spec)`. */
export function toValues(spec: TableSpec, entity: Row): unknown[] {
  const known = KNOWN(spec);
  const extra: Row = {};
  for (const [k, v] of Object.entries(entity)) if (!known.has(k) && v !== undefined) extra[k] = v;
  const values = spec.fields.map((f) => {
    const v = entity[f.key];
    if (v === undefined || v === null) return null;
    return f.kind === "json" ? JSON.stringify(v) : v;
  });
  return [entity.id, ...values, Object.keys(extra).length ? JSON.stringify(extra) : null];
}

export const columns = (spec: TableSpec) => ["id", ...spec.fields.map(column), "extra"];

/** Table row → entity, without the `null`s the application never wrote. */
export function fromRow(spec: TableSpec, row: Row): Row {
  const entity: Row = { id: row.id };
  for (const f of spec.fields) {
    const v = row[column(f)];
    if (v !== null && v !== undefined) entity[f.key] = v;
  }
  if (row.extra && typeof row.extra === "object") Object.assign(entity, row.extra);
  return entity;
}
