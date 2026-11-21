import "server-only";
import { Pool, neon } from "@neondatabase/serverless";

/*
  One pool per process for Neon Postgres. `DATABASE_URL` should be the pooled
  connection string (host contains `-pooler`): serverless instances come and go,
  and the pooler keeps their connections from piling up on the database.
*/

let pool: Pool | null = null;

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не задан.");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

/**
 * Reads go over HTTP: one request carries a whole batch of statements in a
 * single transaction, with no connection to open first. For a screen that
 * needs twelve tables that is one round trip instead of a handshake and twelve.
 */
export function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не задан.");
  return neon(process.env.DATABASE_URL);
}

/** Postgres "relation does not exist" — the tables have not been created yet. */
export const isMissingTable = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
