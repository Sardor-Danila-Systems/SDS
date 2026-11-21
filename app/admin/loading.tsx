/** Shown at once while an admin screen fetches its data, so a click never looks dead. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
