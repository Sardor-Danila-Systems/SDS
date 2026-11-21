import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyCrmData, type CrmData } from "@/types/crm";
import { getPool, getSql, hasDatabase, isMissingTable } from "@/lib/db";
import { SCHEMA_SQL, SETTINGS_TABLE, TABLES, columns, fromRow, toValues, type TableSpec } from "./schema";

/*
  Persistence for the CRM.

  Two drivers sit behind one interface (`readCrm`, `mutateCrm`):

  - `db`   — Neon Postgres, one table per entity (see `schema.ts`). Used
             whenever `DATABASE_URL` is set.
  - `file` — local development without a database. Writes `.data/crm.json`,
             which is gitignored.

  `CRM_STORE=file|db` overrides the choice.

  The callers still think in terms of one `CrmData` document: they get it from
  `mutateCrm`, change it, and return. Here that turns into a transaction —
  take a lock, read the tables, run the change, and write back only the rows
  that differ (inserted, updated or removed). Two saves can't overwrite each
  other any more: they queue on the lock, in this process or any other, and
  each sees what the previous one wrote. A save also touches only its own
  rows, so moving one lead no longer rewrites the whole CRM.
*/

const FILE_PATH = path.join(process.cwd(), ".data", "crm.json");
/** Same number for every instance — it is what makes writers queue up. */
const LOCK_ID = 7301;

/** How long a parsed document is reused by the file driver. The database is always read fresh. */
const MEMO_TTL_MS = 5_000;

export type StoreDriver = "db" | "file";

export class CrmStoreError extends Error {}

function driver(): StoreDriver {
  const override = process.env.CRM_STORE;
  if (override === "file" || override === "db") return override;
  return hasDatabase() ? "db" : "file";
}

export async function storeDriver(): Promise<StoreDriver> {
  return driver();
}

/** Set when a write actually failed, so the dashboard can say why. */
let writeFailure: string | null = null;

/** Why the database isn't being used, when it isn't. Surfaced on the dashboard. */
export async function storeWarning(): Promise<string | null> {
  if (writeFailure) return writeFailure;
  if (driver() === "file" && !process.env.CRM_STORE) return "DATABASE_URL не задан — CRM пишется в локальный файл";
  return null;
}

/* --------------------------------- memo ---------------------------------- */

let memo: { data: CrmData; at: number } | null = null;

/** Drop the memo — the next read goes back to storage. */
export function invalidateCrm() {
  memo = null;
}

/* -------------------------------- database ------------------------------- */

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

let schemaReady: Promise<void> | null = null;

/** Create the tables when they are missing. Safe to run from several instances at once. */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID + 1]);
      for (const sql of SCHEMA_SQL) await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      schemaReady = null;
      throw error;
    } finally {
      client.release();
    }
  })();
  return schemaReady;
}

/** What each row looked like when it was read, to find out what a change touched. */
type Snapshot = Map<string, Map<string, string>>;

const rowKey = (spec: TableSpec, entity: Record<string, unknown>) => JSON.stringify(toValues(spec, entity));

const SELECTS = [`select key, value from ${SETTINGS_TABLE}`, ...TABLES.map((spec) => `select * from ${spec.table} order by seq`)];

/** Everything in one HTTP request — what a plain read uses. */
async function fetchAllHttp(): Promise<Record<string, unknown>[][]> {
  const sql = getSql();
  return (await sql.transaction((t) => SELECTS.map((text) => t.query(text)))) as Record<string, unknown>[][];
}

async function fetchAllOn(q: Queryable): Promise<Record<string, unknown>[][]> {
  return (await Promise.all(SELECTS.map((text) => q.query(text)))).map((r) => r.rows);
}

async function loadFrom(fetchAll: () => Promise<Record<string, unknown>[][]>): Promise<{ data: CrmData; snapshot: Snapshot }> {
  const [settingsRows, ...tableRows] = await fetchAll();
  const settings = { rows: settingsRows };
  const tables = tableRows.map((rows) => ({ rows }));

  const data = { ...emptyCrmData } as unknown as Record<string, unknown>;
  const snapshot: Snapshot = new Map();
  TABLES.forEach((spec, i) => {
    const entities = tables[i].rows.map((row) => fromRow(spec, row));
    data[spec.prop] = entities;
    snapshot.set(spec.table, new Map(entities.map((e) => [String(e.id), rowKey(spec, e)])));
  });

  const setting = (key: string) => settings.rows.find((r) => r.key === key)?.value;
  data.version = (setting("version") as number | undefined) ?? emptyCrmData.version;
  data.standupSchedule = setting("standupSchedule") ?? undefined;
  snapshot.set(SETTINGS_TABLE, new Map([
    ["version", JSON.stringify(data.version)],
    ["standupSchedule", JSON.stringify(data.standupSchedule ?? null)],
  ]));
  return { data: data as unknown as CrmData, snapshot };
}

async function upsert(q: Queryable, spec: TableSpec, entity: Record<string, unknown>) {
  const cols = columns(spec);
  const jsonCols = new Set([...spec.fields.filter((f) => f.kind === "json").map((f) => f.col ?? f.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)), "extra"]);
  const placeholders = cols.map((c, i) => (jsonCols.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
  await q.query(
    `insert into ${spec.table} (${cols.join(", ")}) values (${placeholders.join(", ")})
     on conflict (id) do update set ${updates.join(", ")}`,
    toValues(spec, entity),
  );
}

async function saveTo(q: Queryable, data: CrmData, before: Snapshot) {
  for (const spec of TABLES) {
    const was = before.get(spec.table) ?? new Map<string, string>();
    const entities = (data[spec.prop] as unknown as Record<string, unknown>[]) ?? [];
    const seen = new Set<string>();
    for (const entity of entities) {
      const id = String(entity.id);
      seen.add(id);
      if (was.get(id) !== rowKey(spec, entity)) await upsert(q, spec, entity);
    }
    const removed = [...was.keys()].filter((id) => !seen.has(id));
    if (removed.length) await q.query(`delete from ${spec.table} where id = any($1)`, [removed]);
  }

  const wasSettings = before.get(SETTINGS_TABLE);
  const next: [string, unknown][] = [
    ["version", data.version],
    ["standupSchedule", data.standupSchedule ?? null],
  ];
  for (const [key, value] of next) {
    if (wasSettings?.get(key) === JSON.stringify(value)) continue;
    if (value === null || value === undefined) await q.query(`delete from ${SETTINGS_TABLE} where key = $1`, [key]);
    else {
      await q.query(
        `insert into ${SETTINGS_TABLE} (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`,
        [key, JSON.stringify(value)],
      );
    }
  }
}

/** Replace the whole CRM — used by the one-off import, not by the application. */
export async function importCrm(data: CrmData): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID]);
    const { snapshot } = await loadFrom(() => fetchAllOn(client));
    await saveTo(client, { ...emptyCrmData, ...data }, snapshot);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* ---------------------------------- file --------------------------------- */

async function readFromFile(): Promise<CrmData | null> {
  try {
    return JSON.parse(await fs.readFile(FILE_PATH, "utf8")) as CrmData;
  } catch {
    return null;
  }
}

async function writeToFile(data: CrmData) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/* --------------------------------- public -------------------------------- */

/**
 * The document, for reading. The result is shared, so callers must treat it as
 * immutable — anything that changes data goes through `mutateCrm`, which reads
 * its own copy.
 */
export async function readCrm(): Promise<CrmData> {
  if (driver() === "file") {
    if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.data;
    const data = { ...emptyCrmData, ...(await readFromFile()) };
    memo = { data, at: Date.now() };
    return data;
  }

  try {
    // The schema is only created when a read finds it missing — not on every cold start.
    try {
      return (await loadFrom(fetchAllHttp)).data;
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      await ensureSchema();
      return (await loadFrom(fetchAllHttp)).data;
    }
  } catch {
    // A failed read is never memoised — an empty document is a symptom, not
    // an answer, and the next attempt should try storage again.
    return { ...emptyCrmData };
  }
}

/*
  Mutations run one at a time.

  A mutation is read-modify-write over the whole document. In the database it
  happens inside a transaction that holds an advisory lock, so two of them
  never overlap — not in this process and not across Vercel instances — and
  the one that comes second reads what the first one wrote.
*/
let fileQueue: Promise<unknown> = Promise.resolve();

export async function mutateCrm<T>(
  change: (data: CrmData) => T | Promise<T>,
  retried = false,
): Promise<T> {
  if (driver() === "file") {
    const run = async () => {
      const data = { ...emptyCrmData, ...(await readFromFile()) };
      const result = await change(data);
      await writeToFile(data);
      memo = { data, at: Date.now() };
      return result;
    };
    const result = fileQueue.then(run, run);
    fileQueue = result.catch(() => undefined);
    return result;
  }

  let released = false;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID]);
    const loaded = await loadFrom(() => fetchAllOn(client));
    const { data, snapshot } = loaded;
    const result = await change(data);
    await saveTo(client, data, snapshot);
    await client.query("commit");
    writeFailure = null;
    return result;
  } catch (cause) {
    await client.query("rollback").catch(() => undefined);
    // First use of an empty database: create the tables, then run the change again.
    if (isMissingTable(cause) && !retried) {
      client.release();
      released = true;
      await ensureSchema();
      return mutateCrm(change, true);
    }
    // A refusal from the application ("lead not found") is not a storage fault.
    if (cause instanceof Error && cause.name === "DatabaseError") {
      const message = cause.message;
      writeFailure = `Не удалось сохранить в базу: ${message}`;
      throw new CrmStoreError(`Не удалось сохранить: ${message}.`);
    }
    throw cause;
  } finally {
    if (!released) client.release();
  }
}
