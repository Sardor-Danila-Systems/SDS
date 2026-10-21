"use client";

import { useTransition } from "react";
import { setUserActiveAction } from "@/app/admin/crm/actions";

export function UserActiveToggle({
  userId,
  active,
}: {
  userId: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (active && !window.confirm("Отключить аккаунт? Сотрудник сразу потеряет доступ.")) return;
        startTransition(async () => {
          await setUserActiveAction(userId, !active);
        });
      }}
      className="text-xs text-subtle-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      {active ? "Отключить" : "Включить"}
    </button>
  );
}
