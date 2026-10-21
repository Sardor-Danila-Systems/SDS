"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { PIPELINE_STAGES, pipelineColumn, type Lead, type LeadStage } from "@/types/crm";
import { cn } from "@/lib/utils";
import { STAGE_LABEL, formatDate, formatMoney } from "./ui";
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
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  // Move the card the moment it is dropped; the server write follows.
  const [items, moveCard] = useOptimistic(
    leads,
    (state: Lead[], change: { id: string; stage: LeadStage }) =>
      state.map((lead) =>
        lead.id === change.id ? { ...lead, stage: change.stage } : lead,
      ),
  );

  function drop(stage: LeadStage) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;

    const lead = items.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;

    startTransition(async () => {
      moveCard({ id, stage });
      await setLeadStageAction(id, stage);
    });
  }

  return (
    <div
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
          const total = column.reduce(
            (sum, lead) =>
              sum + (lead.proposedPrice?.amount ?? lead.budget?.amount ?? 0),
            0,
          );
          const currency =
            column[0]?.proposedPrice?.currency ?? column[0]?.budget?.currency ?? "UZS";

          return (
            <section
              key={stage}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={() => drop(stage)}
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

              {showMoney && total > 0 ? (
                <p className="px-1 text-xs text-muted-foreground tabular">
                  {formatMoney({ amount: total, currency })}
                </p>
              ) : null}

              <ul className="mt-3 space-y-2">
                {column.map((lead) => (
                  <li key={lead.id}>
                    <div
                      draggable
                      onDragStart={() => setDragging(lead.id)}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong active:cursor-grabbing",
                        dragging === lead.id && "opacity-40",
                      )}
                    >
                      <Link href={`/admin/crm/leads/${lead.id}`} className="block">
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
  );
}
