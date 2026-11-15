import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMES, asRecord, distributionReport, schemeFor, split,
} from "./distribution.ts";

const dev = [{ userId: "a", role: "lead" as const }];
const pair = [
  { userId: "a", role: "lead" as const },
  { userId: "b", role: "helper" as const },
];

test("every scheme adds up to 100%", () => {
  for (const scheme of Object.values(SCHEMES)) {
    assert.equal(scheme.shares.reduce((s, x) => s + x.percent, 0), 100);
  }
});

test("v2 $500 with a developer", () => {
  assert.deepEqual(asRecord(split(500, { scheme: "v2", executors: dev })), {
    sardor: 150, dania: 150, investor: 75, expenses: 15, "user:a": 90, fund: 20,
  });
});

test("v2 $500 with two executors — 60/40 of the executor share", () => {
  const r = asRecord(split(500, { scheme: "v2", executors: pair }));
  assert.equal(r["user:a"], 54);
  assert.equal(r["user:b"], 36);
  assert.equal(r.fund, 20);
});

test("v2 $500 built by the owners — executor share goes to the fund", () => {
  assert.deepEqual(asRecord(split(500, { scheme: "v2", builtByOwners: true, executors: dev })), {
    sardor: 150, dania: 150, investor: 75, expenses: 15, fund: 110,
  });
});

test("v2 $1 000 — executor gets 180", () => {
  assert.equal(asRecord(split(1000, { scheme: "v2", executors: dev }))["user:a"], 180);
});

test("v1 $1 000", () => {
  assert.deepEqual(asRecord(split(1000, { scheme: "v1", executors: dev })), {
    sardor: 350, dania: 350, investor: 150, development: 150,
  });
});

test("v2 without executors keeps the share visible as unassigned", () => {
  assert.equal(asRecord(split(500, { scheme: "v2" })).executor, 90);
});

test("parts always add up to the whole, even on odd amounts", () => {
  for (const amount of [0.01, 1, 333.33, 1234567, 999.99]) {
    for (const input of [
      { scheme: "v1" as const },
      { scheme: "v2" as const, executors: pair },
      { scheme: "v2" as const, executors: [...pair, { userId: "c", role: "helper" as const }] },
    ]) {
      const sum = split(amount, input).reduce((s, l) => s + l.amount, 0);
      assert.equal(Math.round(sum * 100), Math.round(amount * 100), `${amount} ${JSON.stringify(input)}`);
    }
  }
});

test("scheme defaults by creation date", () => {
  assert.equal(schemeFor({ createdAt: "2026-11-14T23:00:00.000Z" }), "v1");
  assert.equal(schemeFor({ createdAt: "2026-11-15T08:00:00.000Z" }), "v2");
  assert.equal(schemeFor({ createdAt: "2026-11-20T08:00:00.000Z", schemeVersion: "v1" }), "v1");
});

const kassa = {
  id: "p1",
  name: "Касса 16.11",
  createdAt: "2026-10-01T00:00:00.000Z",
  schemeVersion: "v1" as const,
  price: { amount: 3700, currency: "USD" },
  payments: [
    { id: "x", amount: 1500, currency: "USD", paidAt: "2026-10-05", createdBy: "u" },
    { id: "y", amount: 600, currency: "USD", paidAt: "2026-11-16", createdBy: "u" },
  ],
};

test("kassa 16.11: v1, $2 100 of $3 700 — expected basis", () => {
  const [usd] = distributionReport([kassa], [], "expected");
  assert.equal(usd!.projects[0]!.paid, 2100);
  assert.equal(usd!.projects[0]!.debt, 1600);
  assert.deepEqual(usd!.earned, { sardor: 1295, dania: 1295, investor: 555, development: 555 });
});

test("kassa 16.11: cash basis splits what came in, by month", () => {
  const [usd] = distributionReport([kassa], [], "cash");
  assert.deepEqual(usd!.earned, { sardor: 735, dania: 735, investor: 315, development: 315 });
  assert.deepEqual(usd!.months.map((m) => m.month), ["2026-11", "2026-10"]);
  assert.equal(usd!.months[0]!.withoutDevelopers.sardor, 210);
});

test("payouts with a payee are subtracted from what is left to receive", () => {
  const [usd] = distributionReport(
    [kassa],
    [
      { amount: 500, currency: "USD", payee: "sardor" },
      { amount: 100, currency: "USD" },
      { amount: 999, currency: "USD", payee: "dania", deletedAt: "2026-11-01" },
    ],
    "expected",
  );
  assert.equal(usd!.paidOut.sardor, 500);
  assert.equal(usd!.remaining.sardor, 795);
  assert.equal(usd!.remaining.dania, 1295);
});
