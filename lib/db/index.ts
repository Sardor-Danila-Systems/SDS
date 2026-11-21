import "server-only";
import { Pool } from "@neondatabase/serverless";

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
