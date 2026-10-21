"use client";

import { useTransition } from "react";
import { ACTIVE_LEAD_STAGES, type LeadStage } from "@/types/crm";
import { STAGE_LABEL } from "./ui";
import { setLeadStageAction } from "@/app/admin/crm/actions";
import { cn } from "@/lib/utils";

/**
 * Changing a stage is the most frequent action in the CRM, so it is one click
 * from the card. Every change is written to the timeline by the repository.
 */
export function StagePicker({
  leadId,
  stage,
}: {
  leadId: string;
  stage: LeadStage;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("flex flex-wrap gap-1.5", pending && "opacity-60")}>
      {ACTIVE_LEAD_STAGES.map((option) => {
        const active = option === stage;
        return (
          <button
            key={option}
            type="button"
            disabled={pending || active}
            onClick={() =>
              startTransition(async () => {
                await setLeadStageAction(leadId, option);
              })
            }
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-panel)]"
                : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {STAGE_LABEL[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}
