import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development; otherwise every reload
// opens a new pool and Postgres eventually runs out of connections.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  const pool = new Pool({ connectionString: url, max: 10, min: 1 });
  // On Vercel (Fluid compute), closes idle connections before the function is
  // suspended so they do not leak; a no-op elsewhere.
  attachDatabasePool(pool);
  return pool;
}

const pool = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
