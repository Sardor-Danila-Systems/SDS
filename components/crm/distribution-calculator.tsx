"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  EXECUTOR_SPLIT,
  PARTICIPANT_LABEL,
  SCHEMES,
  SCHEME_VERSIONS,
  split,
  type SchemeVersion,
} from "@/lib/crm/distribution";
import { formatShare } from "./distribution-format";

type Mode = "dev" | "pair" | "owners";

const MODES: { value: Mode; label: string }[] = [
  { value: "dev", label: "С разработчиком" },
  { value: "pair", label: "Два исполнителя" },
  { value: "owners", label: "Сделали собственники" },
];

/** Stand-in people for the calculator — the split only cares about roles. */
const CALC_NAMES: Record<string, string> = {
  "user:lead": `Ведущий исполнитель (${EXECUTOR_SPLIT.lead}%)`,
  "user:helper": `Помощник (${EXECUTOR_SPLIT.helper}%)`,
  "user:dev": "Исполнитель",
};

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

/** Enter a price, pick who built it and the scheme — the split updates as you type. */
export function DistributionCalculator() {
  const [raw, setRaw] = useState("1000");
  const [scheme, setScheme] = useState<SchemeVersion>("v2");
  const [mode, setMode] = useState<Mode>("dev");
  const [currency, setCurrency] = useState("USD");

  const amount = Number(raw.replace(/[^\d.]/g, "")) || 0;
  const lines = split(amount, {
    scheme,
    builtByOwners: mode === "owners",
    executors:
      mode === "pair"
        ? [
            { userId: "lead", role: "lead" },
            { userId: "helper", role: "helper" },
          ]
        : [{ userId: "dev", role: "lead" }],
  });

  return (
    <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Цена проекта</span>
            <input
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className={cn(selectClass, "tabular")}
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Валюта</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Кто делал</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={selectClass}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Схема</span>
          <select value={scheme} onChange={(e) => setScheme(e.target.value as SchemeVersion)} className={selectClass}>
            {SCHEME_VERSIONS.map((v) => (
              <option key={v} value={v}>{SCHEMES[v].label}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{SCHEMES[scheme].hint}</p>
        {scheme === "v1" && mode !== "owners" ? (
          <p className="text-xs text-muted-foreground">
            В старой схеме у исполнителя нет отдельной доли — ему платят из развития.
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {lines.map((line) => (
          <li key={line.key} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <span>{CALC_NAMES[line.key] ?? PARTICIPANT_LABEL[line.key] ?? line.key}</span>
            <span className="font-medium tabular">{formatShare(line.amount, currency)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-4 bg-surface px-4 py-2.5 text-sm font-semibold">
          <span>Итого</span>
          <span className="tabular">{formatShare(amount, currency)}</span>
        </li>
      </ul>
    </div>
  );
}
