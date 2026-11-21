import { cache } from "react";
import type { Project } from "@/types/project";
import seedProjectsJson from "@/data/projects-seed.json";
import { getPool, getSql, hasDatabase, isMissingTable } from "@/lib/db";
import { ensureSchema } from "@/lib/crm/store";

/*
  The portfolio shown on the public site lives in the `portfolio_projects`
  table in Neon Postgres (images stay in Vercel Blob — only their URLs are
  stored here).

  - Without `DATABASE_URL` (local development) or while the table is still
    empty, the site falls back to the seed bundled in the repo, so it is never
    blank before the first admin save.
  - The public site reads through a short memo (`MEMO_TTL_MS`); anything that
    writes, and the admin screens, which must show what was just saved, read
    with `{ fresh: true }`.
*/

/** How long the list is reused on the public site. */
const MEMO_TTL_MS = 15_000;

interface ProjectsFile {
    projects: Project[];
}

// The JSON import is inferred with literal types, which don't line up with
// the unions in Project. It is our own file, so widen it once here.
const seedProjects = seedProjectsJson as unknown as ProjectsFile;

let memo: { projects: Project[]; at: number } | null = null;

type Row = Record<string, unknown>;

const KNOWN = new Set(["id", "slug", "title", "kind", "glyph", "href", "domain", "year", "featured", "span", "cover", "images", "technologies", "i18n"]);

function fromRow(row: Row): Project {
    const project: Record<string, unknown> = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        kind: row.kind,
        glyph: row.glyph,
        images: row.images ?? [],
        technologies: row.technologies ?? [],
        featured: row.featured,
        span: row.span,
        i18n: row.i18n ?? {},
    };
    for (const key of ["cover", "href", "domain", "year"]) {
        if (row[key] !== null && row[key] !== undefined) project[key] = row[key];
    }
    if (row.extra && typeof row.extra === "object") Object.assign(project, row.extra);
    return project as unknown as Project;
}

function toParams(project: Project): unknown[] {
    const p = project as unknown as Row;
    const extra: Row = {};
    for (const [k, v] of Object.entries(p)) if (!KNOWN.has(k) && v !== undefined) extra[k] = v;
    return [
        project.id,
        project.slug,
        project.title,
        project.kind,
        project.glyph,
        project.href ?? null,
        project.domain ?? null,
        project.year ?? null,
        Boolean(project.featured),
        project.span ?? "half",
        project.cover ? JSON.stringify(project.cover) : null,
        JSON.stringify(project.images ?? []),
        JSON.stringify(project.technologies ?? []),
        JSON.stringify(project.i18n ?? {}),
        Object.keys(extra).length ? JSON.stringify(extra) : null,
    ];
}

const UPSERT = `insert into portfolio_projects
    (id, slug, title, kind, glyph, href, domain, year, featured, span, cover, images, technologies, i18n, extra)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb)
  on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, kind = excluded.kind, glyph = excluded.glyph,
    href = excluded.href, domain = excluded.domain, year = excluded.year, featured = excluded.featured,
    span = excluded.span, cover = excluded.cover, images = excluded.images,
    technologies = excluded.technologies, i18n = excluded.i18n, extra = excluded.extra`;

/** One trip to storage, no memo involved. */
async function load(): Promise<Project[]> {
    if (!hasDatabase()) return seedProjects.projects;

    try {
        const read = () => getSql().query("select * from portfolio_projects order by id") as Promise<Row[]>;
        let rows: Row[];
        try {
            rows = await read();
        } catch (error) {
            if (!isMissingTable(error)) throw error;
            await ensureSchema();
            rows = await read();
        }
        // First run: nothing saved yet, show the seed so the site isn't empty.
        return rows.length ? rows.map(fromRow) : seedProjects.projects;
    } catch {
        return seedProjects.projects;
    }
}

/** Per-request dedupe, on top of the cross-request memo below. */
const loadOnce = cache(load);

export async function readProjects(
    { fresh = false }: { fresh?: boolean } = {},
): Promise<Project[]> {
    if (fresh) {
        const projects = await load();
        memo = { projects, at: Date.now() };
        return projects;
    }

    if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.projects;

    const projects = await loadOnce();
    memo = { projects, at: Date.now() };
    return projects;
}

export class ProjectsStoreError extends Error {}

const LOCK_ID = 7302;

/** Run `work` in a transaction that holds the portfolio lock. */
async function withLock<T>(work: (q: { query: (t: string, p?: unknown[]) => Promise<{ rows: Row[] }> }) => Promise<T>): Promise<T> {
    if (!hasDatabase()) {
        throw new ProjectsStoreError("Не задан DATABASE_URL — сохранить проект некуда.");
    }
    memo = null;
    try {
        await ensureSchema();
        const client = await getPool().connect();
        try {
            await client.query("begin");
            await client.query("select pg_advisory_xact_lock($1)", [LOCK_ID]);
            const result = await work(client);
            await client.query("commit");
            return result;
        } catch (error) {
            await client.query("rollback").catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    } catch (cause) {
        if (cause instanceof ProjectsStoreError) throw cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new ProjectsStoreError(`Не удалось сохранить в базу: ${message}`);
    }
}

/** First save into an empty table: put the seed there too, or the site would lose it. */
async function seedIfEmpty(q: { query: (t: string, p?: unknown[]) => Promise<{ rows: Row[] }> }) {
    const { rows } = await q.query("select count(*)::int as n from portfolio_projects");
    if (Number(rows[0]?.n) > 0) return;
    for (const project of seedProjects.projects) await q.query(UPSERT, toParams(project));
}

/** Replace the whole list — used by the one-off import. */
export async function writeProjects(projects: Project[]): Promise<void> {
    await withLock(async (q) => {
        for (const project of projects) await q.query(UPSERT, toParams(project));
        const ids = projects.map((p) => p.id);
        await q.query("delete from portfolio_projects where not (id = any($1))", [ids]);
    });
    memo = null;
}

export async function getProjectBySlug(slug: string) {
    // Used by the admin editor — it must never open a stale copy of the form.
    const projects = await readProjects({ fresh: true });
    return projects.find((p) => p.slug === slug);
}

export function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export async function upsertProject(project: Project) {
    await withLock(async (q) => {
        await seedIfEmpty(q);
        // A rename arrives as the same id under a new slug — it must stay the same project.
        const { rows } = await q.query(
            "select * from portfolio_projects where slug = $1 or id = $2 order by (slug = $1) desc limit 1",
            [project.slug, Number.isInteger(project.id) && project.id > 0 ? project.id : -1],
        );
        if (rows.length) {
            const current = fromRow(rows[0]);
            await q.query(UPSERT, toParams({ ...current, ...project, id: current.id }));
        } else {
            const next = await q.query("select coalesce(max(id), 0) + 1 as id from portfolio_projects");
            await q.query(UPSERT, toParams({ ...project, id: Number(next.rows[0].id) }));
        }
    });
    memo = null;
    return project;
}

export async function deleteProjectBySlug(slug: string) {
    const removed = await withLock(async (q) => {
        await seedIfEmpty(q);
        const { rows } = await q.query("delete from portfolio_projects where slug = $1 returning id", [slug]);
        return rows.length > 0;
    });
    memo = null;
    return removed;
}
