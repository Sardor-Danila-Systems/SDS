"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Lightbulb, Pencil, Plus, RotateCcw, Sparkles, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IDEA_CATEGORIES,
  IDEA_LEVELS,
  type Idea,
  type IdeaCategory,
  type IdeaLevel,
  type IdeaStatus,
} from "@/types/crm";
import {
  addIdeaAction,
  deleteIdeaAction,
  generateIdeasAction,
  setIdeaStatusAction,
  updateIdeaAction,
  type IdeaResult,
} from "@/app/admin/ideas/actions";

const CATEGORY_LABEL: Record<IdeaCategory, string> = {
  SALES: "Продажи",
  MARKETING: "Маркетинг",
  PRODUCT: "Продукт",
  CLIENTS: "Клиенты",
  TEAM: "Команда",
  PROCESS: "Процессы",
  PARTNERS: "Партнёры",
};
const LEVEL_LABEL: Record<IdeaLevel, string> = { LOW: "низкая", MEDIUM: "средняя", HIGH: "высокая" };
const TABS: { id: IdeaStatus; label: string }[] = [
  { id: "NEW", label: "Новые" },
  { id: "DEVELOPING", label: "В работе" },
  { id: "DONE", label: "Внедрено" },
  { id: "ARCHIVED", label: "Убранные" },
];
const SOURCE_LABEL = { generator: "генератор", ai: "ИИ", manual: "вручную" } as const;

const input =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary";
const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = cn(btn, "bg-primary text-primary-foreground hover:bg-primary-hover");
const btnQuiet = cn(btn, "border border-border bg-card text-foreground hover:bg-surface");

export function IdeasBoard({
  ideas,
  canDelete,
  aiEnabled,
}: {
  ideas: Idea[];
  canDelete: boolean;
  aiEnabled: boolean;
}) {
  const [tab, setTab] = useState<IdeaStatus>("NEW");
  const [category, setCategory] = useState<IdeaCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const out: Record<IdeaStatus, number> = { NEW: 0, DEVELOPING: 0, DONE: 0, ARCHIVED: 0 };
    for (const idea of ideas) out[idea.status] += 1;
    return out;
  }, [ideas]);

  const visible = ideas.filter(
    (idea) =>
      idea.status === tab &&
      (category === "ALL" || idea.category === category) &&
      (!query.trim() || `${idea.title} ${idea.description}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  /** Run a server action and show what happened; the page refreshes itself when it succeeds. */
  const act = (work: () => Promise<IdeaResult>, done?: string) =>
    startTransition(async () => {
      const result = await work();
      setMessage(
        result.ok
          ? done || result.info
            ? { tone: "ok", text: result.info ?? done! }
            : null
          : { tone: "error", text: result.error },
      );
    });

  return (
    <div className="space-y-6">
      <Generator
        aiEnabled={aiEnabled}
        pending={pending}
        onGenerate={(opts) =>
          act(async () => {
            const result = await generateIdeasAction(opts);
            if (result.ok) setTab("NEW");
            return result;
          })
        }
        onAdd={(data) => act(() => addIdeaAction(data), "Идея добавлена")}
      />

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            message.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-primary-soft text-primary",
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm transition-colors",
                tab === t.id ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="tabular text-xs opacity-70">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <input
          className={cn(input, "w-full sm:w-64")}
          placeholder="Поиск по идеям"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск по идеям"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["ALL", ...IDEA_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={cn(
              "h-8 rounded-full border px-3 text-[13px] transition-colors",
              category === c
                ? "border-primary bg-primary-soft font-medium text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "ALL" ? "Все направления" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-card/50 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-surface text-muted-foreground">
            <Lightbulb className="size-5" />
          </span>
          <p className="font-medium">
            {tab === "NEW" ? "Новых идей нет" : tab === "DEVELOPING" ? "Пока ничего не в работе" : tab === "DONE" ? "Пока ничего не внедрено" : "Убранных идей нет"}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {tab === "NEW" ? "Нажмите «Придумать идеи», чтобы сгенерировать несколько, или добавьте свою." : "Идеи появятся здесь, когда вы переведёте их в этот статус."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} canDelete={canDelete} pending={pending} act={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------- generator -------------------------------- */

function Generator({
  aiEnabled,
  pending,
  onGenerate,
  onAdd,
}: {
  aiEnabled: boolean;
  pending: boolean;
  onGenerate: (opts: { category: IdeaCategory | "ANY"; count: number; mood: "practical" | "bold" }) => void;
  onAdd: (data: { title: string; description: string; category: IdeaCategory; effort: IdeaLevel; impact: IdeaLevel }) => void;
}) {
  const [category, setCategory] = useState<IdeaCategory | "ANY">("ANY");
  const [count, setCount] = useState(5);
  const [mood, setMood] = useState<"practical" | "bold">("practical");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", category: "SALES" as IdeaCategory, effort: "MEDIUM" as IdeaLevel, impact: "MEDIUM" as IdeaLevel });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] sm:p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Направление</span>
          <select className={cn(input, "w-48")} value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory | "ANY")}>
            <option value="ANY">Любое</option>
            {IDEA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Сколько</span>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {[3, 5, 8].map((n) => (
              <button key={n} onClick={() => setCount(n)} aria-pressed={count === n} className={cn("h-9 w-10 rounded-md text-sm tabular transition-colors", count === n ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground")}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Настроение</span>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                ["practical", "Практично"],
                ["bold", "Смело"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setMood(id)} aria-pressed={mood === id} className={cn("h-9 rounded-md px-3 text-sm transition-colors", mood === id ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={btnQuiet} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Plus className="size-4" /> Своя идея
          </button>
          <button className={btnPrimary} disabled={pending} onClick={() => onGenerate({ category, count, mood })}>
            <Sparkles className="size-4" /> {pending ? "Придумываю…" : "Придумать идеи"}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {aiEnabled
          ? "Идеи придумывает ИИ по описанию студии и сферам, с которыми вы работаете. Имена клиентов и деньги никуда не отправляются."
          : "Идеи берутся из встроенной библиотеки стратегий и подстраиваются под сферы ваших лидов. Чтобы подключить ИИ, добавьте ANTHROPIC_API_KEY в окружение."}
      </p>

      {adding ? (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.title.trim()) return;
            onAdd(draft);
            setDraft({ ...draft, title: "", description: "" });
            setAdding(false);
          }}
        >
          <input className={input} placeholder="Название идеи" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required maxLength={140} aria-label="Название идеи" />
          <textarea className={cn(input, "h-24 resize-y py-2")} placeholder="Что именно и зачем" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Описание" />
          <div className="flex flex-wrap gap-3">
            <Select label="Направление" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v as IdeaCategory })} options={IDEA_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])} />
            <Select label="Трудоёмкость" value={draft.effort} onChange={(v) => setDraft({ ...draft, effort: v as IdeaLevel })} options={IDEA_LEVELS.map((l) => [l, LEVEL_LABEL[l]])} />
            <Select label="Эффект" value={draft.impact} onChange={(v) => setDraft({ ...draft, impact: v as IdeaLevel })} options={IDEA_LEVELS.map((l) => [l, LEVEL_LABEL[l]])} />
            <button type="submit" className={cn(btnPrimary, "self-end")}>
              Добавить
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className={cn(input, "w-40")} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------------------------------- card ---------------------------------- */

function Level({ label, value, tone }: { label: string; value: IdeaLevel; tone: "effort" | "impact" }) {
  const filled = value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`${label}: ${LEVEL_LABEL[value]}`}>
      {label}
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={cn("h-1.5 w-3.5 rounded-full", n <= filled ? (tone === "impact" ? "bg-primary" : "bg-muted-foreground/70") : "bg-border")} />
        ))}
      </span>
      <span className="sr-only">{LEVEL_LABEL[value]}</span>
    </span>
  );
}

function IdeaCard({
  idea,
  canDelete,
  pending,
  act,
}: {
  idea: Idea;
  canDelete: boolean;
  pending: boolean;
  act: (work: () => Promise<IdeaResult>, done?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: idea.title, description: idea.description, category: idea.category, effort: idea.effort, impact: idea.impact, notes: idea.notes ?? "" });
  const [newStep, setNewStep] = useState("");
  const done = idea.steps.filter((s) => s.done).length;

  const setStatus = (status: IdeaStatus, note?: string) => act(() => setIdeaStatusAction(idea.id, status), note);
  const saveSteps = (steps: Idea["steps"]) => act(() => updateIdeaAction(idea.id, { steps }));

  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-panel)] sm:p-5", idea.status === "ARCHIVED" ? "border-border opacity-80" : "border-border")}>
      {editing ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => updateIdeaAction(idea.id, draft), "Сохранено");
            setEditing(false);
          }}
        >
          <input className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required maxLength={140} aria-label="Название" />
          <textarea className={cn(input, "h-28 resize-y py-2")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Описание" />
          <textarea className={cn(input, "h-20 resize-y py-2")} placeholder="Заметки: что решили, что получилось" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} aria-label="Заметки" />
          <div className="flex flex-wrap gap-3">
            <Select label="Направление" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v as IdeaCategory })} options={IDEA_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])} />
            <Select label="Трудоёмкость" value={draft.effort} onChange={(v) => setDraft({ ...draft, effort: v as IdeaLevel })} options={IDEA_LEVELS.map((l) => [l, LEVEL_LABEL[l]])} />
            <Select label="Эффект" value={draft.impact} onChange={(v) => setDraft({ ...draft, impact: v as IdeaLevel })} options={IDEA_LEVELS.map((l) => [l, LEVEL_LABEL[l]])} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary}>
              <Check className="size-4" /> Сохранить
            </button>
            <button type="button" className={btnQuiet} onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-muted-foreground">{CATEGORY_LABEL[idea.category]}</span>
                <span className="text-subtle-foreground">{SOURCE_LABEL[idea.source]}</span>
              </div>
              <h3 className="text-base font-semibold leading-snug tracking-[-0.01em]">{idea.title}</h3>
            </div>
            <button
              className={cn("rounded-md p-1.5 transition-colors", idea.favorite ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}
              aria-label={idea.favorite ? "Убрать из избранного" : "В избранное"}
              aria-pressed={Boolean(idea.favorite)}
              onClick={() => act(() => updateIdeaAction(idea.id, { favorite: !idea.favorite }))}
            >
              <Star className={cn("size-4.5", idea.favorite && "fill-current")} />
            </button>
          </div>

          {idea.description ? <p className="text-sm leading-relaxed text-muted-foreground">{idea.description}</p> : null}

          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Level label="Трудоёмкость" value={idea.effort} tone="effort" />
            <Level label="Эффект" value={idea.impact} tone="impact" />
          </div>

          {idea.steps.length > 0 || idea.status === "DEVELOPING" ? (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Шаги {idea.steps.length ? `· ${done} из ${idea.steps.length}` : ""}
              </p>
              <ul className="space-y-1">
                {idea.steps.map((step) => (
                  <li key={step.id} className="group flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={step.done}
                      disabled={pending}
                      onChange={() => saveSteps(idea.steps.map((s) => (s.id === step.id ? { ...s, done: !s.done } : s)))}
                      aria-label={step.text}
                    />
                    <span className={cn("flex-1", step.done && "text-muted-foreground line-through")}>{step.text}</span>
                    <button className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100" aria-label="Убрать шаг" onClick={() => saveSteps(idea.steps.filter((s) => s.id !== step.id))}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newStep.trim()) return;
                  saveSteps([...idea.steps, { id: "", text: newStep, done: false }]);
                  setNewStep("");
                }}
              >
                <input className={cn(input, "h-8 text-[13px]")} placeholder="Добавить шаг" value={newStep} onChange={(e) => setNewStep(e.target.value)} aria-label="Новый шаг" />
              </form>
            </div>
          ) : null}

          {idea.notes ? <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground">{idea.notes}</p> : null}

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {idea.status === "NEW" ? (
              <>
                <button className={btnPrimary} disabled={pending} onClick={() => setStatus("DEVELOPING", "Идея в работе")}>
                  Развивать
                </button>
                <button className={btnQuiet} disabled={pending} onClick={() => setStatus("ARCHIVED", "Идея убрана")}>
                  Убрать
                </button>
              </>
            ) : null}
            {idea.status === "DEVELOPING" ? (
              <>
                <button className={btnPrimary} disabled={pending} onClick={() => setStatus("DONE", "Отмечено как внедрённое")}>
                  <Check className="size-4" /> Внедрено
                </button>
                <button className={btnQuiet} disabled={pending} onClick={() => setStatus("NEW")}>
                  <RotateCcw className="size-4" /> В идеи
                </button>
                <button className={btnQuiet} disabled={pending} onClick={() => setStatus("ARCHIVED", "Идея убрана")}>
                  Убрать
                </button>
              </>
            ) : null}
            {idea.status === "DONE" ? (
              <button className={btnQuiet} disabled={pending} onClick={() => setStatus("DEVELOPING")}>
                <RotateCcw className="size-4" /> Вернуть в работу
              </button>
            ) : null}
            {idea.status === "ARCHIVED" ? (
              <button className={btnQuiet} disabled={pending} onClick={() => setStatus("NEW", "Идея вернулась")}>
                <RotateCcw className="size-4" /> Вернуть
              </button>
            ) : null}
            <span className="ml-auto flex gap-1">
              <button className={cn(btn, "w-9 px-0 text-muted-foreground hover:text-foreground")} aria-label="Редактировать" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
              </button>
              {canDelete && idea.status === "ARCHIVED" ? (
                <button className={cn(btn, "w-9 px-0 text-muted-foreground hover:text-destructive")} aria-label="Удалить" disabled={pending} onClick={() => act(() => deleteIdeaAction(idea.id), "Идея удалена")}>
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </span>
          </div>
        </>
      )}
    </li>
  );
}
