"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/admin/crm/actions";

/*
  One wrapper for every CRM form, so each screen gets a pending state, an
  inline error and a consistent submit without repeating the plumbing.

  A save also has to be *visible*. On success the form clears itself and says
  so for a moment: without that, a form that keeps what was typed while the
  list quietly refreshes above it reads as "nothing happened", and the record
  gets entered a second time.
*/

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-panel)] transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel = "Сохранить",
  pendingLabel = "Сохраняем…",
  className,
  footer,
  /** Clear the fields after a successful save. Off for forms you keep editing. */
  resetOnSuccess = true,
  savedLabel = "Сохранено",
}: {
  action: (form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  footer?: ReactNode;
  resetOnSuccess?: boolean;
  savedLabel?: string;
}) {
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, form: FormData) => action(form),
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);

  // Every submit returns a new result object, so this fires once per save.
  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)}>
      {children}

      {state && !state.ok ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Submit label={submitLabel} pendingLabel={pendingLabel} />
        {saved ? (
          <span className="text-sm text-primary" role="status">
            {savedLabel}
          </span>
        ) : null}
        {footer}
      </div>
    </form>
  );
}

/** A button that fires an action with no form fields — convert, advance, etc. */
export function ActionButton({
  action,
  children,
  variant = "ghost",
  confirm,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  variant?: "primary" | "ghost";
  confirm?: string;
}) {
  const [state, formAction] = useActionState(
    async () => action(),
    null,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      <SubmitInline variant={variant}>{children}</SubmitInline>
      {state && !state.ok ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}

function SubmitInline({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors disabled:opacity-60",
        variant === "primary"
          ? "h-10 bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? "…" : children}
    </button>
  );
}
