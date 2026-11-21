import "server-only";
import { randomUUID } from "node:crypto";
import { getPool, hasDatabase, isMissingTable } from "@/lib/db";
import { ensureSchema } from "@/lib/crm/store";

/*
  Uploaded pictures live in the `media` table (Neon Postgres) and are served by
  `/api/media/<id>`. A portfolio image is a few hundred kilobytes, uploads are
  rare, and the response is cached for a year (the id never changes content),
  so a table is simpler than running a separate file store.
*/

export class MediaError extends Error {}

export async function saveMedia(input: { name: string; contentType: string; data: Buffer }): Promise<string> {
  if (!hasDatabase()) throw new MediaError("Не задан DATABASE_URL — загружать картинки некуда.");
  await ensureSchema();
  const id = randomUUID();
  await getPool().query(
    "insert into media (id, name, content_type, size, data) values ($1, $2, $3, $4, $5)",
    [id, input.name, input.contentType, input.data.length, input.data],
  );
  return `/api/media/${id}`;
}

export async function readMedia(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  if (!hasDatabase() || !/^[0-9a-f-]{36}$/.test(id)) return null;
  let rows: Record<string, unknown>[];
  try {
    ({ rows } = await getPool().query("select content_type, data from media where id = $1", [id]));
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!rows.length) return null;
  return { contentType: String(rows[0].content_type), data: rows[0].data as Buffer };
}
