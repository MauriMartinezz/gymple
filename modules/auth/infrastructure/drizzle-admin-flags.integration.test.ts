import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { InMemoryEmailSender } from "@/infrastructure/email/testing/in-memory-email-sender";
import { runGrantAdmin } from "../application/grant-admin";
import { createAuth } from "./create-auth";
import { DrizzleAdminFlags } from "./drizzle-admin-flags";

// Runs against a real, disposable Postgres database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = drizzle({ client: pool, schema });
const flags = new DrizzleAdminFlags(db);
const baseURL = "http://localhost:3000";

async function deleteAllUsers() {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
  await db.delete(schema.users);
}

async function addUser(email: string, isAdmin = false) {
  const [{ id }] = await db.insert(schema.users).values({ name: "X", email, isAdmin }).returning({ id: schema.users.id });
  return id;
}

const adminFlagOf = async (email: string) =>
  (await db.select({ isAdmin: schema.users.isAdmin }).from(schema.users).where(eq(schema.users.email, email)))[0]
    ?.isAdmin;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

beforeEach(deleteAllUsers);

afterAll(async () => {
  await deleteAllUsers();
  await pool.end();
});

describe("DrizzleAdminFlags", () => {
  it("reads the flag from the database", async () => {
    const plain = await addUser("plain@example.com");
    const admin = await addUser("admin@example.com", true);

    expect(await flags.isAdmin(plain)).toBe(false);
    expect(await flags.isAdmin(admin)).toBe(true);
    expect(await flags.isAdmin(999_999)).toBe(false);
  });

  it("grants by email, ignoring case, and touches no other account", async () => {
    await addUser("ana@example.com");
    await addUser("bruno@example.com");

    expect(await flags.grantByEmail("ANA@example.com")).toBe("granted");
    expect(await flags.grantByEmail("ana@example.com")).toBe("already_admin");
    expect(await flags.grantByEmail("nobody@example.com")).toBe("no_account");
    expect(await adminFlagOf("ana@example.com")).toBe(true);
    expect(await adminFlagOf("bruno@example.com")).toBe(false);
  });

  it("backs `pnpm admin:grant`", async () => {
    await addUser("ana@example.com");

    expect(await runGrantAdmin(["ana@example.com"], flags)).toEqual({ exitCode: 0, message: "ana@example.com is now an admin." });
    expect(await adminFlagOf("ana@example.com")).toBe(true);
  });
});

describe("the admin flag and better-auth", () => {
  const auth = createAuth({
    db,
    emailSender: new InMemoryEmailSender(),
    baseURL,
    secret: "integration-test-secret-integration-test-secret",
    rateLimit: false,
  });

  it("cannot be set through sign-up", async () => {
    await auth.handler(
      new Request(`${baseURL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ name: "Eve", email: "eve@example.com", password: "correct-horse-1", isAdmin: true }),
      }),
    );

    expect(await adminFlagOf("eve@example.com")).toBe(false);
  });
});
