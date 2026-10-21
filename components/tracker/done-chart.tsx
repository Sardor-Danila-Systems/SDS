import type { DayBucket } from "./stats";

const DAY_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/**
 * Finished tasks per day, stacked by department. Plain CSS bars rather than a
 * chart library: it is one small picture, and the numbers are in the titles.
 */
export function DoneChart({ days }: { days: DayBucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.sales + d.dev + d.other));
  const total = days.reduce((sum, d) => sum + d.sales + d.dev + d.other, 0);
  const step = days.length > 14 ? 5 : 2;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Разработка
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--success)]" /> Продажи
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-subtle-foreground" /> Управление
        </span>
        <span className="ml-auto tabular">всего {total}</span>
      </div>

      <div className="flex h-40 items-end gap-1" role="img" aria-label={`Выполнено задач по дням, всего ${total}`}>
        {days.map((d) => {
          const sum = d.sales + d.dev + d.other;
          const label = `${DAY_FORMAT.format(new Date(`${d.date}T00:00:00`))}: ${sum} (продажи ${d.sales}, разработка ${d.dev})`;
          return (
            <div key={d.date} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              {sum > 0 ? (
                <span className="mb-1 text-center text-[0.625rem] tabular text-muted-foreground">{sum}</span>
              ) : null}
              <div className="flex flex-col-reverse overflow-hidden rounded-sm" style={{ height: `${(sum / max) * 100}%` }}>
                <div className="bg-primary" style={{ flex: d.dev }} />
                <div className="bg-[var(--success)]" style={{ flex: d.sales }} />
                <div className="bg-subtle-foreground" style={{ flex: d.other }} />
              </div>
              {sum === 0 ? <div className="h-px bg-border-strong" /> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1">
        {days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 text-center text-[0.625rem] text-subtle-foreground">
            {(days.length - 1 - i) % step === 0 ? DAY_FORMAT.format(new Date(`${d.date}T00:00:00`)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
