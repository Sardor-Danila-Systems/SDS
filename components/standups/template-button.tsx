"use client";

import { useRef } from "react";

/** Fills a textarea of the surrounding form with a ready-made list of questions. */
export function TemplateButton({
  field,
  template,
  label = "Подставить шаблон",
}: {
  field: string;
  template: string;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        const area = ref.current
          ?.closest("form")
          ?.querySelector<HTMLTextAreaElement>(`textarea[name="${field}"]`);
        if (!area) return;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, template);
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }}
      className="text-xs text-primary transition-colors hover:underline"
    >
      {label}
    </button>
  );
}
