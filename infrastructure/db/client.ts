import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development; otherwise every reload
// opens a new pool and MySQL eventually runs out of connections.
const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

function createPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return mysql.createPool({ uri: url, connectionLimit: 10 });
}

const pool = globalForDb.mysqlPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;

export const db = drizzle({ client: pool, schema, mode: "default" });
export type Db = typeof db;
