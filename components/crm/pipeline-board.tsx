"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES, pipelineColumn, type Lead, type LeadStage } from "@/types/crm";
import { cn } from "@/lib/utils";
import { STAGE_LABEL, formatDate, formatMoney, formatTotals, sumByCurrency } from "./ui";
import { setLeadStageAction } from "@/app/admin/crm/actions";

/**
 * The kanban.
 *
 * Drag and drop uses the platform's own HTML5 events rather than a library —
 * the board is a handful of columns and the behaviour is simple enough that a
 * dependency would cost more than it saves. Every card is also a link, and
 * each column header offers a menu-free fallback: on touch, where dragging is
 * unreliable, the card's own stage buttons still work from the lead page.
 */
export function PipelineBoard({
  leads,
  showMoney,
}: {
  leads: Lead[];
  showMoney: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);

  /*
    Where a card was dropped, kept until the server's own data agrees.

    `useOptimistic` forgets the move the moment the action returns, and the
    page that follows can still be rendered from an older copy of the CRM (a
    different serverless instance, a memoised read) — the card then jumped
    back as if the drop had not worked. An override stays until the data
    coming from the server shows the same stage, or the save fails.
  */
  const [moved, setMoved] = useState<Record<string, LeadStage>>({});

  useEffect(() => {
    setMoved((current) => {
      let changed = false;
      const next: Record<string, LeadStage> = {};
      for (const [id, stage] of Object.entries(current)) {
        const lead = leads.find((l) => l.id === id);
        if (lead && lead.stage !== stage) next[id] = stage;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [leads]);

  const items = useMemo(
    () => leads.map((lead) => (moved[lead.id] ? { ...lead, stage: moved[lead.id] } : lead)),
    [leads, moved],
  );
  const pending = saving > 0;

  const scroller = useRef<HTMLDivElement>(null);

  /** The board is wider than the screen: nudge it sideways while a card is held near an edge. */
  function autoScroll(clientX: number) {
    const el = scroller.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    const zone = 90;
    if (clientX < left + zone) el.scrollLeft -= Math.ceil((left + zone - clientX) / 4);
    else if (clientX > right - zone) el.scrollLeft += Math.ceil((clientX - (right - zone)) / 4);
  }

  function drop(stage: LeadStage) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;

    const lead = items.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;

    const previous = lead.stage;
    setError(null);
    setMoved((m) => ({ ...m, [id]: stage }));
    setSaving((n) => n + 1);

    void setLeadStageAction(id, stage)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
      })
      .catch((cause: unknown) => {
        // Put the card back and say why — a silent snap-back looks like a broken drop.
        setMoved((m) => {
          const { [id]: _drop, ...rest } = m;
          void _drop;
          return rest;
        });
        setError(
          `Не удалось перенести карточку (${STAGE_LABEL[previous] ?? previous} → ${STAGE_LABEL[stage] ?? stage}): ${
            cause instanceof Error ? cause.message : "ошибка сохранения"
          }`,
        );
      })
      .finally(() => setSaving((n) => n - 1));
  }

  return (
    <>
    {error ? (
      <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    ) : null}
    <div
      ref={scroller}
      className={cn(
        "-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        pending && "opacity-80",
      )}
    >
      <div className="flex min-w-max gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const column = items.filter(
            (lead) => pipelineColumn(lead.stage) === stage,
          );
          const totals = sumByCurrency(
            column.map((lead) => lead.proposedPrice ?? lead.budget),
          );

          return (
            <section
              key={stage}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(stage);
                autoScroll(event.clientX);
              }}
              // dragleave also fires when the pointer moves onto a child of the column — ignore that.
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setOver((s) => (s === stage ? null : s));
              }}
              onDrop={(event) => {
                // Without this the browser may open the dragged card's link instead of dropping it.
                event.preventDefault();
                drop(stage);
              }}
              className={cn(
                "w-72 shrink-0 rounded-xl border p-3 transition-colors",
                over === stage
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface/60",
              )}
            >
              <header className="flex items-center justify-between px-1 pb-1">
                <h2 className="label">{STAGE_LABEL[stage] ?? stage}</h2>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs tabular text-muted-foreground">{column.length}</span>
              </header>

              {showMoney && totals.length > 0 ? (
                <p className="px-1 text-xs text-muted-foreground tabular">
                  {formatTotals(totals)}
                </p>
              ) : null}

              <ul className="mt-3 space-y-2">
                {column.map((lead) => (
                  <li key={lead.id}>
                    <div
                      draggable
                      onDragStart={(event) => {
                        // Firefox starts no drag without data; the effect keeps the cursor honest.
                        event.dataTransfer.setData("text/plain", lead.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(lead.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong active:cursor-grabbing",
                        dragging === lead.id && "opacity-40",
                      )}
                    >
                      <Link href={`/admin/crm/leads/${lead.id}`} draggable={false} className="block">
                        <p className="text-sm font-medium leading-snug">
                          {lead.company ??
                            `${lead.firstName} ${lead.lastName ?? ""}`.trim()}
                        </p>
                        {lead.company ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {`${lead.firstName} ${lead.lastName ?? ""}`.trim()}
                          </p>
                        ) : null}
                        {lead.service ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {lead.service}
                          </p>
                        ) : null}
                        {showMoney &&
                        (lead.proposedPrice?.amount || lead.budget?.amount) ? (
                          <p className="mt-2 text-xs tabular">
                            {formatMoney(lead.proposedPrice ?? lead.budget)}
                          </p>
                        ) : null}
                        {lead.nextActionTitle ? (
                          <p className="mt-2 border-t border-border pt-2 text-xs text-subtle-foreground">
                            {lead.nextActionTitle} · {formatDate(lead.nextActionAt)}
                          </p>
                        ) : null}
                      </Link>
                    </div>
                  </li>
                ))}

                {column.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-xs text-subtle-foreground">
                    пусто
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
    </>
  );
}
