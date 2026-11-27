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
  // An idle connection ended by the server (Neon autosuspend, restart, network
  // drop) is re-emitted here; unhandled, it would crash the process. The pool
  // already discarded that client and opens a new one on the next query.
  pool.on("error", (error) => {
    console.error("Idle database connection error:", error.message);
  });
  // On Vercel (Fluid compute), closes idle connections before the function is
  // suspended so they do not leak; a no-op elsewhere.
  attachDatabasePool(pool);
  return pool;
}

const pool = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
