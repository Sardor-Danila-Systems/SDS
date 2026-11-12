"use client";

import { useTransition } from "react";
import { deleteUserAction, setUserActiveAction } from "@/app/admin/crm/actions";

export function UserActiveToggle({
  userId,
  active,
}: {
  userId: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <>
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
    {!active ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Удалить аккаунт навсегда?")) return;
          startTransition(async () => {
            await deleteUserAction(userId);
          });
        }}
        className="text-xs text-destructive transition-colors hover:opacity-80 disabled:opacity-60"
      >
        Удалить
      </button>
    ) : null}
    </>
  );
}
