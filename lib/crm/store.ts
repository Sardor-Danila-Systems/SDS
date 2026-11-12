import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import { emptyCrmData, type CrmData } from "@/types/crm";

/*
  Persistence for the CRM.

  There is no database in this project — the public content already lives as a
  JSON document in Vercel Blob, and the CRM follows the same shape so there is
  one storage story rather than two.

  Two drivers sit behind one interface:

  - `blob` — production. Overwrites a single pathname in place.
  - `file` — local development. Writes `.data/crm.json`, which is gitignored.

  `CRM_STORE=file|blob` overrides the choice; otherwise a write token means
  Blob. A misconfigured store (private access, bad token) is reported at the
  moment of saving — see `writeCrm` — rather than by a probe write on every
  cold start, which cost a network round trip before the first read.

  The CRM lives in a PRIVATE Blob store (`CRM_BLOB_READ_WRITE_TOKEN`): client
  contacts, money and password hashes must never sit at a URL anyone can open.
  The public store (`BLOB_READ_WRITE_TOKEN`) keeps only what browsers load —
  portfolio images and the site's content. The CRM used to live there too; the
  first read with a private store configured moves it (see `moveFromPublic`):
  copy, read back and compare, keep a private backup, then delete the public
  copy. Without `CRM_BLOB_READ_WRITE_TOKEN` the old public place is used and the
  dashboard says so.

  Three things keep reads cheap, because the whole document is fetched for
  every screen:

  - the blob's URL is resolved once per process (it is a fixed pathname), so a
    read is one request instead of `list()` + `fetch`;
  - the parsed document is held for `MEMO_TTL_MS`, so the several reads a
    single screen makes cost one network request between them;
  - a successful write seeds that memo with what was just saved, so the render
    that follows a save shows the new data without going back to Blob at all.

  Swapping in a real database later means replacing this file and nothing
  else — everything above it goes through `readCrm`/`writeCrm`.
*/

// CRM_BLOB_PATHNAME exists for checks against a real store without touching the CRM.
const BLOB_PATHNAME = process.env.CRM_BLOB_PATHNAME || "data/crm.json";
const BACKUP_PREFIX = "backups/crm-";
const FILE_PATH = path.join(process.cwd(), ".data", "crm.json");

/** How long a parsed document is reused before going back to storage. */
const MEMO_TTL_MS = 5_000;

export type StoreDriver = "blob" | "file";

export class CrmStoreError extends Error {}

function describeBlobFailure(message: string) {
  if (privateToken() && /public store|private access/i.test(message)) {
    return "CRM_BLOB_READ_WRITE_TOKEN указывает на публичное хранилище, а CRM нужно закрытое";
  }
  if (/private store|public access/i.test(message)) {
    return "хранилище Vercel Blob создано с приватным доступом, а данным нужен публичный";
  }
  if (/access denied|token/i.test(message)) {
    return privateToken()
      ? "Vercel Blob отклонил токен закрытого хранилища (CRM_BLOB_READ_WRITE_TOKEN)"
      : "Vercel Blob отклонил токен (BLOB_READ_WRITE_TOKEN)";
  }
  return message;
}

/** The private store's token; without it the CRM stays in the public store. */
const privateToken = () => process.env.CRM_BLOB_READ_WRITE_TOKEN || undefined;

function driver(): StoreDriver {
  const override = process.env.CRM_STORE;
  if (override === "file" || override === "blob") return override;
  return privateToken() || process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "file";
}

/** Set when a write to Blob actually failed, so the dashboard can say why. */
let writeFailure: string | null = null;

export async function storeDriver(): Promise<StoreDriver> {
  return driver();
}

/** Why Blob isn't being used, when it isn't. Surfaced on the dashboard. */
export async function storeWarning(): Promise<string | null> {
  if (writeFailure) return writeFailure;
  if (driver() === "file" && !process.env.CRM_STORE) {
    return "BLOB_READ_WRITE_TOKEN не задан";
  }
  if (driver() === "blob" && !privateToken()) {
    return "CRM лежит в публичном хранилище Blob — задайте CRM_BLOB_READ_WRITE_TOKEN (закрытое хранилище)";
  }
  return null;
}

/* --------------------------------- memo ---------------------------------- */

let memo: { data: CrmData; at: number } | null = null;

/** Drop the memo — the next read goes back to storage. */
export function invalidateCrm() {
  memo = null;
}

/* -------------------------------- drivers -------------------------------- */

// The pathname is fixed and written with `addRandomSuffix: false`, so the URL
// never changes for the life of the store. Resolving it once turns every
// later read into a single request.
let blobUrl: string | null = null;

async function resolveBlobUrl(): Promise<string | null> {
  if (blobUrl) return blobUrl;
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 10 });
  blobUrl = blobs.find((b) => b.pathname === BLOB_PATHNAME)?.url ?? null;
  return blobUrl;
}

async function readFromBlob(): Promise<CrmData | null> {
  const url = await resolveBlobUrl();
  if (!url) return null;

  // `cache: "no-store"` only bypasses Next's own cache. The blob is served
  // through a CDN, so the URL is also made unique per read — without it an
  // edge node can keep answering with the copy from before the last save,
  // which looks exactly like a save that silently didn't happen.
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    // The blob may have been replaced or removed — resolve it again next time.
    blobUrl = null;
    return null;
  }
  return (await res.json()) as CrmData;
}

/* ------------------------------ private store ----------------------------- */

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** The CRM from the private store; null only when it is not there yet. Errors throw. */
async function readPrivate(token: string): Promise<CrmData | null> {
  const found = await get(BLOB_PATHNAME, { access: "private", token, useCache: false });
  if (!found) return null;
  if (!found.stream) throw new CrmStoreError("Хранилище CRM вернуло пустой ответ.");
  return JSON.parse(await new Response(found.stream).text()) as CrmData;
}

async function putPrivate(token: string, pathname: string, payload: string, overwrite: boolean) {
  await put(pathname, payload, {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

/** The CRM as it was kept in the public store: null only when it is really not there. */
async function readPublicCopy(): Promise<{ data: CrmData; url: string } | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 10 });
  const blob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  if (!blob) return null;
  const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" });
  // A failed read of the old copy must stop the move, not look like an empty CRM.
  if (!res.ok) throw new CrmStoreError(`Не удалось прочитать CRM из публичного хранилища: ${res.status}.`);
  return { data: (await res.json()) as CrmData, url: blob.url };
}

/** Set once this process knows there is no CRM left in the public store. */
let publicChecked = false;
/** Set once this process has read the CRM from the private store. */
let seenPrivate = false;

/**
 * Public → private, once. Copy without overwriting (another instance may have
 * moved it a moment ago — then that copy wins), read it back and compare,
 * keep a private backup, and only then delete the public copy.
 */
async function moveFromPublic(token: string): Promise<CrmData | null> {
  // The CRM was here a moment ago: a missing document now is a fault, never a fresh start.
  if (seenPrivate) throw new CrmStoreError("CRM не нашлась в закрытом хранилище — пустую не начинаю, проверьте хранилище.");
  const old = await readPublicCopy();
  if (!old) {
    // Moved before (backups exist) but the document is gone: refuse to start an empty CRM.
    const { blobs } = await list({ prefix: BACKUP_PREFIX, limit: 1, token });
    if (blobs.length) {
      throw new CrmStoreError("CRM нет в закрытом хранилище, но есть резервные копии (backups/) — восстановите последнюю, пустую CRM не начинаю.");
    }
    publicChecked = true;
    return null;
  }
  const payload = JSON.stringify(old.data, null, 2);
  try {
    await putPrivate(token, BLOB_PATHNAME, payload, false);
  } catch (cause) {
    const theirs = await readPrivate(token);
    if (theirs) return theirs;
    throw cause;
  }
  const check = await readPrivate(token);
  if (!check || JSON.stringify(check, null, 2) !== payload) {
    throw new CrmStoreError("Перенос CRM в закрытое хранилище не подтвердился — публичную копию не трогаю.");
  }
  await putPrivate(token, `${BACKUP_PREFIX}moved-${stamp()}.json`, payload, false);
  try {
    await del(old.url);
    publicChecked = true;
  } catch {
    // The private copy is in place; `dropPublicCopy` finishes the cleanup on a later read.
    publicChecked = false;
  }
  return check;
}

/**
 * After the move, a copy can still reappear in the public store: an instance
 * of the previous deployment saving in the minute of the switch. Once per
 * process: back it up privately and remove it, so nothing stays public.
 */
async function dropPublicCopy(token: string): Promise<void> {
  if (publicChecked || !process.env.BLOB_READ_WRITE_TOKEN) return;
  publicChecked = true;
  try {
    const stray = await readPublicCopy();
    if (!stray) return;
    await putPrivate(token, `${BACKUP_PREFIX}stray-${stamp()}.json`, JSON.stringify(stray.data, null, 2), false);
    await del(stray.url);
  } catch {
    publicChecked = false; // try again on the next read
  }
}

async function readFromFile(): Promise<CrmData | null> {
  try {
    return JSON.parse(await fs.readFile(FILE_PATH, "utf8")) as CrmData;
  } catch {
    return null;
  }
}

/** One trip to storage, no memo involved. */
async function load(): Promise<CrmData> {
  let data: CrmData | null;
  const token = privateToken();
  if (driver() === "file") {
    data = await readFromFile();
  } else if (token) {
    data = await readPrivate(token);
    if (data) {
      seenPrivate = true;
      await dropPublicCopy(token);
    } else {
      data = await moveFromPublic(token);
      if (data) seenPrivate = true;
    }
  } else {
    data = await readFromBlob();
  }
  // Tolerate a document written by an older shape.
  return data ? { ...emptyCrmData, ...data } : { ...emptyCrmData };
}

/* --------------------------------- public -------------------------------- */

/**
 * The document, for reading. The result is shared, so callers must treat it as
 * immutable — anything that changes data goes through `mutateCrm`, which reads
 * its own copy.
 */
export async function readCrm(): Promise<CrmData> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.data;

  try {
    const data = await load();
    memo = { data, at: Date.now() };
    return data;
  } catch {
    // A failed read is never memoised — an empty document is a symptom, not
    // an answer, and the next attempt should try storage again.
    return { ...emptyCrmData };
  }
}

export async function writeCrm(data: CrmData): Promise<void> {
  const payload = JSON.stringify(data, null, 2);
  // Whatever happens next, the copy from before this write is now wrong.
  memo = null;

  if (driver() === "file") {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, payload, "utf8");
    memo = { data, at: Date.now() };
    return;
  }

  try {
    const token = privateToken();
    if (token) {
      await putPrivate(token, BLOB_PATHNAME, payload, true);
    } else {
      const result = await put(BLOB_PATHNAME, payload, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        // The document is overwritten in place, so it must not be cached at the
        // edge: a stale copy here is a lost save as far as anyone can tell.
        cacheControlMaxAge: 0,
      });
      blobUrl = result.url;
    }
    writeFailure = null;
    // Seed the memo with what was just saved, so the screen rendered right
    // after the save is correct without another round trip.
    memo = { data, at: Date.now() };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    writeFailure = describeBlobFailure(message);
    throw new CrmStoreError(`Не удалось сохранить: ${writeFailure}.`);
  }
}

/*
  Mutations run one at a time.

  A mutation is read-modify-write over the whole document. Two of them
  overlapping — a second save started before the first finished, a form
  submitted twice, a stage dragged while a lead is being created — both read
  the same document, each applies its own change to its own copy, and the
  slower write wins. The other change is gone, with no error anywhere: it
  looks exactly like a save that sometimes works and sometimes doesn't.

  Chaining them removes that race within this process. Two Vercel instances
  writing in the same second could still overlap; a document store gives no
  way to prevent that, and it is a real database's job. For a team of two in
  one office, the in-process queue is the whole of the problem.
*/
let queue: Promise<unknown> = Promise.resolve();

export async function mutateCrm<T>(
  change: (data: CrmData) => T | Promise<T>,
): Promise<T> {
  const run = async () => {
    // Always fresh: a mutation must never be applied to a memoised copy, and
    // by the time this runs an earlier mutation in the queue may have written.
    const data = await load();
    const result = await change(data);
    await writeCrm(data);
    return result;
  };

  // `then(run, run)` — a mutation that failed must not stall the ones behind it.
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
