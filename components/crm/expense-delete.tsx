"use client";

import { useTransition } from "react";
import { deleteExpenseAction } from "@/app/admin/crm/actions";

/** Soft delete — the row disappears from the list but stays in the journal. */
export function ExpenseDelete({ expenseId }: { expenseId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Удалить этот расход?")) return;
        startTransition(async () => {
          await deleteExpenseAction(expenseId);
        });
      }}
      className="text-xs text-subtle-foreground transition-colors hover:text-destructive disabled:opacity-60"
    >
      {pending ? "Удаляем…" : "Удалить"}
    </button>
  );
}
