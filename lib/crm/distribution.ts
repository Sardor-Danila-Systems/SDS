import type { ClientProject, Expense, ProjectExecutor } from "@/types/crm";

/*
  How project money is split between the people of SDS.

  Pure on purpose: no store, no session — the page, the calculator and the
  tests all call the same functions. Every percent lives in `SCHEMES` and
  `EXECUTOR_SPLIT` below; nothing else in the code knows a number.
*/

/* --------------------------------- config --------------------------------- */

export type SchemeVersion = "v1" | "v2";
export const SCHEME_VERSIONS: SchemeVersion[] = ["v1", "v2"];

/** Projects created on or after this day use v2 unless one is set by hand. */
export const SCHEME_V2_FROM = "2026-11-15";

/**
 * Where a share goes. `executor` is a placeholder resolved to the actual
 * developers of a project (or to the fund when the owners built it).
 */
export type ShareKey =
  | "sardor"
  | "dania"
  | "investor"
  | "development"
  | "expenses"
  | "executor"
  | "fund";

export interface SchemeConfig {
  label: string;
  hint: string;
  /** Percent of the project price. Must add up to 100. */
  shares: { key: ShareKey; percent: number }[];
  /** Gets the rounding remainder, so the parts always add up to the whole. */
  remainderTo: ShareKey;
}

export const SCHEMES: Record<SchemeVersion, SchemeConfig> = {
  v1: {
    label: "Старая (v1)",
    hint: "Проекты до 15.11.2026. Расходы бизнеса — из доли развития.",
    shares: [
      { key: "sardor", percent: 35 },
      { key: "dania", percent: 35 },
      { key: "investor", percent: 15 },
      { key: "development", percent: 15 },
    ],
    remainderTo: "development",
  },
  v2: {
    label: "Новая (v2)",
    hint: "Проекты с 15.11.2026. Пул команды 25% = расходы 3% + исполнитель 18% + фонд 4%.",
    shares: [
      { key: "sardor", percent: 30 },
      { key: "dania", percent: 30 },
      { key: "investor", percent: 15 },
      { key: "expenses", percent: 3 },
      { key: "executor", percent: 18 },
      { key: "fund", percent: 4 },
    ],
    remainderTo: "fund",
  },
};

/** How the executor share is divided when two people built the project. */
export const EXECUTOR_SPLIT: Record<ProjectExecutor["role"], number> = {
  lead: 60,
  helper: 40,
};

/** Display names. Developers are `user:<id>` and are named from the team list. */
export const PARTICIPANT_LABEL: Record<string, string> = {
  sardor: "Сардор",
  dania: "Даня",
  investor: "Инвестор",
  development: "Развитие",
  expenses: "Расходы",
  fund: "Фонд команды",
  executor: "Исполнитель не указан",
};

/** People a payout can be booked to besides developers. */
export const FIXED_PAYEES = ["sardor", "dania", "investor"] as const;

/** Stable order of rows in totals: owners, investor, business, then developers. */
const ORDER = ["sardor", "dania", "investor", "development", "expenses", "fund", "executor"];

export const executorKey = (userId: string) => `user:${userId}`;

/* --------------------------------- split ---------------------------------- */

export interface SplitInput {
  scheme: SchemeVersion;
  builtByOwners?: boolean;
  executors?: ProjectExecutor[];
}

export interface SplitLine {
  key: string;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `amount × percent / 100`, kept free of float noise (0.1 + 0.2). */
const pct = (amount: number, percent: number) => round2((amount * percent) / 100);

function splitExecutors(amount: number, executors: ProjectExecutor[]): SplitLine[] {
  const leads = executors.filter((e) => e.role === "lead");
  const helpers = executors.filter((e) => e.role === "helper");
  // One kind only — they share the whole executor part, nobody's 40% is lost.
  const leadPart = pct(amount, EXECUTOR_SPLIT.lead);
  const groups =
    leads.length && helpers.length
      ? [
          { people: leads, part: leadPart },
          { people: helpers, part: round2(amount - leadPart) },
        ]
      : [{ people: executors, part: amount }];

  const out: SplitLine[] = [];
  for (const { people, part } of groups) {
    const each = round2(part / people.length);
    people.forEach((person, i) => {
      // The last person in a group takes the cent left by dividing.
      const value = i === people.length - 1 ? round2(part - each * (people.length - 1)) : each;
      out.push({ key: executorKey(person.userId), amount: value });
    });
  }
  return out;
}

/**
 * Splits one amount by a scheme. Lines are merged by key, so a person who
 * appears twice (e.g. a fund that also gets the executor part) is one row.
 */
export function split(amount: number, input: SplitInput): SplitLine[] {
  const scheme = SCHEMES[input.scheme];
  const lines = new Map<string, number>();
  const add = (key: string, value: number) =>
    lines.set(key, round2((lines.get(key) ?? 0) + value));

  for (const share of scheme.shares) {
    const value = pct(amount, share.percent);
    if (share.key !== "executor") {
      add(share.key, value);
      continue;
    }
    const executors = input.executors ?? [];
    if (input.builtByOwners) add("fund", value);
    else if (executors.length === 0) add("executor", value);
    else for (const line of splitExecutors(value, executors)) add(line.key, line.amount);
  }

  const sum = [...lines.values()].reduce((a, b) => a + b, 0);
  const remainder = round2(amount - sum);
  if (remainder !== 0) add(scheme.remainderTo, remainder);

  return [...lines].map(([key, value]) => ({ key, amount: value }));
}

/** Turns lines into a lookup — handy in tests and tables. */
export function asRecord(lines: SplitLine[]): Record<string, number> {
  return Object.fromEntries(lines.map((l) => [l.key, l.amount]));
}

/* -------------------------------- projects -------------------------------- */

type SplitProject = Pick<
  ClientProject,
  "id" | "name" | "createdAt" | "price" | "payments" | "schemeVersion" | "builtByOwners" | "executors"
>;

export function schemeFor(project: Pick<ClientProject, "createdAt" | "schemeVersion">): SchemeVersion {
  if (project.schemeVersion) return project.schemeVersion;
  return project.createdAt.slice(0, 10) >= SCHEME_V2_FROM ? "v2" : "v1";
}

/**
 * "With developers" — someone other than the owners is paid for the work.
 * Under v1 there is no executor share, but a project with executors listed is
 * still one the team built, so it lands in the same group.
 */
export function withDevelopers(project: Pick<ClientProject, "builtByOwners" | "executors">): boolean {
  return !project.builtByOwners && (project.executors?.length ?? 0) > 0;
}

export const splitInputFor = (project: SplitProject): SplitInput => ({
  scheme: schemeFor(project),
  builtByOwners: project.builtByOwners,
  executors: project.executors,
});

/** `cash` — what clients actually paid; `expected` — the full agreed price. */
export type Basis = "cash" | "expected";

export interface ProjectRow {
  id: string;
  name: string;
  currency: string;
  total: number;
  paid: number;
  debt: number;
  scheme: SchemeVersion;
  withDevelopers: boolean;
  builtByOwners: boolean;
  executors: ProjectExecutor[];
  lines: SplitLine[];
}

export interface MonthGroup {
  month: string;
  withDevelopers: Record<string, number>;
  withoutDevelopers: Record<string, number>;
  total: Record<string, number>;
}

export interface CurrencyDistribution {
  currency: string;
  projects: ProjectRow[];
  months: MonthGroup[];
  /** What each participant earned on this basis. */
  earned: Record<string, number>;
  /** Payouts and advances already booked as expenses with a payee. */
  paidOut: Record<string, number>;
  /** `earned − paidOut`, for everyone who has either. */
  remaining: Record<string, number>;
  /** Participants in display order — every key that appears above. */
  keys: string[];
}

function addInto(target: Record<string, number>, lines: SplitLine[]) {
  for (const line of lines) target[line.key] = round2((target[line.key] ?? 0) + line.amount);
}

function sortKeys(keys: Iterable<string>) {
  const rank = (k: string) => {
    const i = ORDER.indexOf(k);
    return i === -1 ? ORDER.length : i;
  };
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The whole report, per currency — sums and dollars are never added together.
 *
 * On the `cash` basis each payment is split on its own and lands in the month
 * it was paid; on `expected` the full price lands in the month the project was
 * created.
 */
export function distributionReport(
  projects: SplitProject[],
  expenses: Pick<Expense, "amount" | "currency" | "payee" | "deletedAt">[],
  basis: Basis,
): CurrencyDistribution[] {
  const byCurrency = new Map<string, CurrencyDistribution>();
  const bucket = (currency: string) => {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = { currency, projects: [], months: [], earned: {}, paidOut: {}, remaining: {}, keys: [] };
      byCurrency.set(currency, entry);
    }
    return entry;
  };
  const month = (entry: CurrencyDistribution, key: string) => {
    let row = entry.months.find((m) => m.month === key);
    if (!row) {
      row = { month: key, withDevelopers: {}, withoutDevelopers: {}, total: {} };
      entry.months.push(row);
    }
    return row;
  };

  for (const project of projects) {
    const currency = project.price?.currency ?? project.payments[0]?.currency ?? "UZS";
    const total = project.price?.amount ?? 0;
    const paid = round2(project.payments.reduce((sum, p) => sum + p.amount, 0));
    const input = splitInputFor(project);
    const devs = withDevelopers(project);
    const entry = bucket(currency);

    const lines = split(basis === "cash" ? paid : total, input);
    entry.projects.push({
      id: project.id,
      name: project.name,
      currency,
      total,
      paid,
      debt: round2(Math.max(total - paid, 0)),
      scheme: input.scheme,
      withDevelopers: devs,
      builtByOwners: Boolean(project.builtByOwners),
      executors: project.executors ?? [],
      lines,
    });
    addInto(entry.earned, lines);

    const parts =
      basis === "cash"
        ? project.payments.map((p) => ({ month: p.paidAt.slice(0, 7), lines: split(p.amount, input) }))
        : [{ month: project.createdAt.slice(0, 7), lines }];
    for (const part of parts) {
      const row = month(entry, part.month);
      addInto(devs ? row.withDevelopers : row.withoutDevelopers, part.lines);
      addInto(row.total, part.lines);
    }
  }

  for (const expense of expenses) {
    if (expense.deletedAt || !expense.payee) continue;
    const entry = bucket(expense.currency);
    entry.paidOut[expense.payee] = round2((entry.paidOut[expense.payee] ?? 0) + expense.amount);
  }

  for (const entry of byCurrency.values()) {
    entry.keys = sortKeys([...Object.keys(entry.earned), ...Object.keys(entry.paidOut)]);
    for (const key of entry.keys) {
      entry.remaining[key] = round2((entry.earned[key] ?? 0) - (entry.paidOut[key] ?? 0));
    }
    entry.months.sort((a, b) => b.month.localeCompare(a.month));
  }
  return [...byCurrency.values()];
}
