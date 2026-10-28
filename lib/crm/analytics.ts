import "server-only";
import { requirePermission } from "./repo";
import { readCrm } from "./store";
import { addDays, wallNow } from "./standups";
import type { AnalyticsBentoProps } from "@/components/ui/analytics-bento";

/*
  Numbers for the analytics page, computed from the CRM's own records.

  Amounts are never mixed across currencies: everything here is for one
  currency at a time, chosen by the caller. All dates are the team's wall-clock
  dates (Tashkent, UTC+5 with no daylight saving), the same as the rest of the
  admin.
*/

export const ANALYTICS_CURRENCIES = ["UZS", "USD"] as const;
export type AnalyticsCurrency = (typeof ANALYTICS_CURRENCIES)[number];

export type AnalyticsData = Pick<
  AnalyticsBentoProps,
  "currency" | "revenue" | "sessions" | "categories" | "seasonality"
> & {
  /** False when there is not a single payment to chart. */
  hasMoney: boolean;
};

const UTC_OFFSET_HOURS = 5;
const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const DAY_LABEL = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/** "+12%" style change; "новое" when there was nothing before. */
function change(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "новое" : "0%";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct < 0 ? "-" : ""}${Math.abs(pct)}%`;
}

/** The Tashkent date and hour of an instant. */
function wall(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + UTC_OFFSET_HOURS * 3_600_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

export async function buildAnalytics(currency: AnalyticsCurrency): Promise<AnalyticsData> {
  await requirePermission("finance.report");
  const data = await readCrm();
  const today = wallNow().date;
  const unit = currency === "USD" ? "$" : "";
  const code = currency;

  const projects = (data.projects ?? []).filter((p) => !p.deletedAt);
  const clientName = (clientId: string) => {
    const c = (data.clients ?? []).find((x) => x.id === clientId);
    return c ? (c.company ?? c.name) : "—";
  };

  // Every payment in this currency, with where it belongs.
  const payments = projects.flatMap((project) =>
    project.payments
      .filter((p) => p.currency === currency)
      .map((p) => ({
        date: p.paidAt.slice(0, 10),
        amount: p.amount,
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        client: clientName(project.clientId),
      })),
  );
  const between = (from: string, to: string) =>
    payments.filter((p) => p.date >= from && p.date <= to);
  const sum = (rows: { amount: number }[]) => rows.reduce((n, r) => n + r.amount, 0);

  /* ------------------------------- revenue ------------------------------ */
  const from30 = addDays(today, -29);
  const last30 = between(from30, today);
  const prev30 = between(addDays(today, -59), addDays(today, -30));
  let running = 0;
  const series = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from30, i);
    running += sum(payments.filter((p) => p.date === date));
    return { label: DAY_LABEL.format(new Date(`${date}T00:00:00Z`)), value: running };
  });

  /* ------------------------------ activity ------------------------------ */
  const roleOf = new Map<string, string>(
    (data.users ?? []).map((u) => [u.id, u.role] as [string, string]),
  );
  const perHour = (role: string, week: number) => {
    const to = addDays(today, -7 * week);
    const from = addDays(to, -6);
    const counts = new Array<number>(24).fill(0);
    for (const a of data.activities ?? []) {
      if (roleOf.get(a.actorId) !== role) continue;
      const { date, hour } = wall(a.createdAt);
      if (date >= from && date <= to) counts[hour]++;
    }
    return [...counts, counts[0]];
  };
  const total = (arr: number[]) => arr.slice(0, 24).reduce((n, v) => n + v, 0);
  const salesWeeks = [0, 1, 2].map((w) => perHour("SALES", w));
  const devWeeks = [0, 1, 2].map((w) => perHour("DEVELOPER", w));
  const thisWeek = total(salesWeeks[0]!) + total(devWeeks[0]!);
  const lastWeek = total(salesWeeks[1]!) + total(devWeeks[1]!);

  /* ------------------------------ categories ---------------------------- */
  const periodDays = [7, 30, 365];
  const window = (days: number, back = 0) => {
    const to = addDays(today, -days * back);
    return between(addDays(to, -(days - 1)), to);
  };
  const groupOf = (status: string) =>
    status === "COMPLETED" ? "done" : status === "PAUSED" || status === "CANCELLED" ? "paused" : "active";
  const items = projects
    .map((project) => ({
      name: project.name,
      group: groupOf(project.status),
      values: periodDays.map((days) =>
        sum(window(days).filter((p) => p.projectId === project.id)),
      ),
    }))
    .filter((item) => item.values.some((v) => v > 0));

  const clientTotals = (days: number) => {
    const map = new Map<string, number>();
    for (const p of window(days)) map.set(p.client, (map.get(p.client) ?? 0) + p.amount);
    return map;
  };
  const yearly = clientTotals(365);
  const topClients = [...yearly.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const weekly = clientTotals(7);
  const monthly = clientTotals(30);

  /* ----------------------------- seasonality ---------------------------- */
  const thisYear = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const ofYear = (year: number) => payments.filter((p) => p.date.startsWith(`${year}-`));
  const monthly12 = (year: number) =>
    Array.from({ length: 12 }, (_, m) =>
      sum(ofYear(year).filter((p) => Number(p.date.slice(5, 7)) === m + 1)),
    );
  const yearBlock = (year: number) => {
    const rows = ofYear(year);
    const isCurrent = year === thisYear;
    const months = isCurrent ? monthIndex + 1 : 12;
    const avg = sum(rows) / months;
    const prevRows = ofYear(year - 1);
    const prevAvg = sum(prevRows) / 12;
    const byClient = new Map<string, number>();
    for (const p of rows) byClient.set(p.client, (byClient.get(p.client) ?? 0) + p.amount);
    return {
      label: String(year),
      values: monthly12(year),
      stats: [
        { label: `В среднем за месяц, ${code}`, value: avg, delta: change(avg, prevAvg), note: `${rows.length} платежей` },
        { label: `За год, ${code}`, value: sum(rows), delta: change(sum(rows), sum(prevRows)), note: isCurrent ? "с начала года" : "весь год" },
      ],
      rows: [...byClient.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, value]) => ({ label, value: fmt(value) })),
    };
  };

  return {
    currency: unit,
    hasMoney: payments.length > 0,
    revenue: {
      label: `Получено, ${code}`,
      value: sum(last30),
      delta: change(sum(last30), sum(prev30)),
      note: last30.length
        ? `Средний платёж ${fmt(sum(last30) / last30.length)} ${code}`
        : "Платежей за 30 дней нет",
      caption: "Последние 30 дней, накопленным итогом",
      series,
    },
    sessions: {
      label: "Действий команды за неделю",
      value: thisWeek,
      delta: change(thisWeek, lastWeek),
      note: "По часам суток, последние 3 недели",
      desktop: salesWeeks,
      mobile: devWeeks,
      labels: { desktop: "Продажи", mobile: "Разработка", prior: "Прошлые недели", current: "эта неделя" },
    },
    categories: {
      title: `Получено по проектам, ${code}`,
      groups: [
        { id: "active", name: "В работе", color: "#8B3DFF", ink: "light" },
        { id: "done", name: "Завершены", color: "#7CFF5B", ink: "dark" },
        {
          id: "paused",
          name: "Пауза и отмена",
          color: "color-mix(in oklab, var(--color-muted-foreground) 45%, var(--color-muted))",
        },
      ],
      periods: [
        { label: "Неделя", days: 7, title: "прошлой недели" },
        { label: "Месяц", days: 30, title: "прошлого месяца" },
        { label: "Год", days: 365, title: "прошлого года" },
      ].map(({ label, days, title }) => {
        const now = sum(window(days));
        const before = sum(window(days, 1));
        return {
          label,
          total: now,
          delta: change(now, before),
          compare: `против ${fmt(before)} ${code} ${title}`,
        };
      }),
      items,
      table: {
        columns: ["Клиент", "Неделя", "Месяц", "Год"],
        rows: topClients.map(([client, year]) => ({
          label: client,
          values: [fmt(weekly.get(client) ?? 0), fmt(monthly.get(client) ?? 0), fmt(year)],
        })),
      },
    },
    seasonality: {
      title: `Сезонность поступлений, ${code}`,
      axis: MONTHS,
      years: [yearBlock(thisYear), yearBlock(thisYear - 1)],
    },
  };
}
