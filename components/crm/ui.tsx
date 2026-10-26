import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadStage, Priority, ProspectStage, Source, TaskStatus } from "@/types/crm";

/*
  The small pieces every CRM screen is built from. Same hairline language as
  the site: rules and type, no boxed cards.
*/

export function PageHeader({
  title,
  hint,
  action,
}: {
  /** Kept so call sites read naturally; the title carries the page. */
  label?: string;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.03em]">
          {title}
        </h1>
        {hint ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The one container for grouped content. A titled card with an optional
 * action; `flush` lets lists and tables run edge to edge.
 */
export function Panel({
  title,
  description,
  action,
  flush,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("admin-panel overflow-hidden", className)}>
      {title || action ? (
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="label">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0 text-sm">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function PrimaryAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-panel)] transition-colors hover:bg-primary-hover"
    >
      {children}
    </Link>
  );
}

/** Nothing here yet — say what to do about it rather than showing blank space. */
export function EmptyState({
  title,
  hint,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-card/50 px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-base font-medium tracking-[-0.01em]">{title}</p>
      {hint ? (
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      ) : null}
      {action}
    </div>
  );
}

const NEUTRAL = "bg-surface text-muted-foreground";
const ACTIVE = "bg-primary-soft text-primary";
const STAGE_TONE: Record<string, string> = {
  NEW: NEUTRAL,
  TO_CONTACT: NEUTRAL,
  CONTACTED: "bg-surface-2 text-foreground",
  INTERESTED: ACTIVE,
  MEETING: ACTIVE,
  PROPOSAL: ACTIVE,
  NEGOTIATION: ACTIVE,
  WON: "bg-[var(--success-soft)] text-[var(--success)]",
  LOST: "bg-surface text-subtle-foreground",
  NOT_NOW: "bg-surface text-subtle-foreground",
};

export const STAGE_LABEL: Record<string, string> = {
  NEW: "Новый",
  TO_CONTACT: "Связаться",
  CONTACTED: "Связались",
  INTERESTED: "Интерес",
  MEETING: "Встреча",
  PROPOSAL: "КП",
  NEGOTIATION: "Переговоры",
  WON: "Сделка",
  LOST: "Отказ",
  NOT_NOW: "Не сейчас",
};

export function StageBadge({ stage }: { stage: LeadStage | ProspectStage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        STAGE_TONE[stage] ?? NEUTRAL,
      )}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

/*
  Sources, currencies and their labels live here rather than being retyped on
  every screen — they were drifting apart across three files.
*/

/** Every value that can appear in a record, including ones no longer offered. */
export const SOURCE_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TELEGRAM: "Telegram",
  WEBSITE: "Сайт",
  REFERRAL: "Рекомендация",
  COLD_CALL: "Звонок",
  PERSONAL: "Личный контакт",
  EMAIL: "Email",
  LINKEDIN: "LinkedIn",
  LONDON_OUTREACH: "London outreach",
  OTHER: "Другое",
};

/** Offered when adding — the channels work actually arrives through here. */
export const SOURCE_OPTIONS: Source[] = [
  "INSTAGRAM",
  "TELEGRAM",
  "REFERRAL",
  "COLD_CALL",
  "WEBSITE",
  "PERSONAL",
  "OTHER",
];

export const DEFAULT_CURRENCY = "UZS";

/** Sums first — the other currency is for the occasional export job. */
export const CURRENCY_OPTIONS = [
  { value: "UZS", label: "сум" },
  { value: "USD", label: "USD" },
];

export function sourceOptions() {
  return SOURCE_OPTIONS.map((value) => ({
    value,
    label: SOURCE_LABEL[value] ?? value,
  }));
}

const PRIORITY_TONE: Record<Priority, string> = {
  LOW: "bg-subtle-foreground/50",
  MEDIUM: "bg-muted-foreground",
  HIGH: "bg-[var(--warning)]",
  URGENT: "bg-destructive",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "низкий",
  MEDIUM: "средний",
  HIGH: "высокий",
  URGENT: "срочно",
};

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", PRIORITY_TONE[priority])} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "К выполнению",
  IN_PROGRESS: "В работе",
  REVIEW: "На проверке",
  DONE: "Готово",
  CANCELLED: "Отменена",
};

/** A KPI tile: the figure, what it counts, and an icon to find it by. */
export function Stat({
  value,
  label,
  tone = "default",
  href,
  icon: Icon,
}: {
  value: string;
  label: string;
  tone?: "default" | "accent" | "warn";
  href?: string;
  icon?: LucideIcon;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              tone === "accent" && "bg-primary-soft text-primary",
              tone === "warn" && "bg-destructive/10 text-destructive",
              tone === "default" && "bg-surface text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 text-[1.75rem] font-semibold leading-none tracking-[-0.035em] tabular",
          tone === "accent" && "text-primary",
          tone === "warn" && "text-destructive",
        )}
      >
        {value}
      </p>
    </>
  );

  const shell = "admin-panel block p-5";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(shell, "transition-colors hover:border-border-strong")}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

/** Dates are shown in one place and one way across the CRM. */
export function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(money?: { amount: number; currency: string }) {
  if (!money || !money.amount) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: money.currency || DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
  }).format(money.amount);
}

/**
 * Sums of money in several currencies. Amounts in different currencies are
 * never added together — each currency gets its own total.
 */
export function sumByCurrency(
  items: ({ amount: number; currency: string } | undefined)[],
): { amount: number; currency: string }[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item?.amount) continue;
    const currency = item.currency || DEFAULT_CURRENCY;
    totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
  }
  return [...totals].map(([currency, amount]) => ({ amount, currency }));
}

/** "95 000 000 UZS · 4 700 $" — or a dash when there is nothing. */
export function formatTotals(totals: { amount: number; currency: string }[]) {
  if (totals.length === 0) return "—";
  return totals.map((money) => formatMoney(money)).join(" · ");
}
