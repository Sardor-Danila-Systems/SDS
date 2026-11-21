/*
  One-off: copy the CRM and the portfolio from Vercel Blob into Neon.

    node --env-file=.env.local --conditions react-server --import tsx scripts/migrate-blob-to-neon.ts [--dry-run]

  Needs DATABASE_URL, CRM_BLOB_READ_WRITE_TOKEN (private store, the CRM) and
  BLOB_READ_WRITE_TOKEN (public store, the portfolio). Blob is only read, never
  changed. The import is idempotent — running it twice gives the same result —
  and it refuses to overwrite a non-empty database unless --force is given.
*/
import { get, list } from "@vercel/blob";
import { emptyCrmData, type CrmData } from "../types/crm";
import type { Project } from "../types/project";
import { importCrm, readCrm } from "../lib/crm/store";
import { readProjects, writeProjects } from "../lib/projects-store";

const DATA = "data/crm.json";
const PORTFOLIO = "data/projects.json";
const dry = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function readCrmFromBlob(): Promise<CrmData | null> {
  const token = process.env.CRM_BLOB_READ_WRITE_TOKEN;
  if (token) {
    const found = await get(DATA, { access: "private", token, useCache: false });
    if (found?.stream) return JSON.parse(await new Response(found.stream).text()) as CrmData;
  }
  // Older installs kept the CRM in the public store.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { blobs } = await list({ prefix: DATA, limit: 10 });
    const blob = blobs.find((b) => b.pathname === DATA);
    if (blob) {
      const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`public CRM: ${res.status}`);
      return (await res.json()) as CrmData;
    }
  }
  return null;
}

async function readPortfolioFromBlob(): Promise<Project[] | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { blobs } = await list({ prefix: PORTFOLIO, limit: 10 });
  const blob = blobs.find((b) => b.pathname === PORTFOLIO);
  if (!blob) return null;
  const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`portfolio: ${res.status}`);
  return ((await res.json()) as { projects: Project[] }).projects;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не задан");

  const crm = await readCrmFromBlob();
  const portfolio = await readPortfolioFromBlob();
  if (!crm) throw new Error("CRM в Blob не найдена — проверьте токены. Ничего не перенесено.");

  const counts = (d: CrmData) =>
    Object.fromEntries(Object.entries(d).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
  console.log("Blob → CRM:", counts({ ...emptyCrmData, ...crm }));
  console.log("Blob → портфолио:", portfolio ? portfolio.length : "нет файла");
  if (dry) return console.log("--dry-run: в базу ничего не записано");

  const existing = await readCrm();
  const filled = existing.leads.length + existing.users.length + existing.clients.length > 0;
  if (filled && !force) throw new Error("В Neon уже есть данные CRM. Если это точно нужно перезаписать — запустите с --force.");

  await importCrm(crm);
  if (portfolio) await writeProjects(portfolio);

  const after = await readCrm();
  const same = JSON.stringify(counts(after)) === JSON.stringify(counts({ ...emptyCrmData, ...crm }));
  const projects = await readProjects({ fresh: true });
  console.log("Neon → CRM:", counts(after));
  console.log("Neon → портфолио:", projects.length);
  if (!same || (portfolio && projects.length !== portfolio.length)) throw new Error("Количество записей не совпало — проверьте вручную.");
  console.log("Готово: количество записей совпадает.");
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
