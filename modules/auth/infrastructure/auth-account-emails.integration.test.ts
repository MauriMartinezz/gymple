import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { InMemoryEmailSender } from "@/infrastructure/email/testing/in-memory-email-sender";
import { DrizzleTrainerRepository } from "@/modules/trainers/infrastructure/drizzle-trainer-repository";
import { createTrainer, updateTrainer } from "@/modules/trainers/application/trainer-admin-use-cases";
import { AuthAccountEmails } from "./auth-account-emails";
import { createAuth } from "./create-auth";

// Runs against a real, disposable MySQL database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = mysql.createPool({ uri: url, connectionLimit: 4 });
const db = drizzle({ client: pool, schema, mode: "default" });
const baseURL = "http://localhost:3000";
const emails = new InMemoryEmailSender();
const auth = createAuth({
  db,
  emailSender: emails,
  baseURL,
  secret: "integration-test-secret-integration-test-secret",
  rateLimit: false,
});
const deps = { trainers: new DrizzleTrainerRepository(db), emails: new AuthAccountEmails(auth) };

const ana = { name: "Ana Typed-By-Admin", email: "ana@example.com", dni: "12345678" };

function post(path: string, body: unknown): Promise<Response> {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify(body),
    }),
  );
}

const signIn = (email: string, password: string) => post("/sign-in/email", { email, password });

/** Follows the emailed link to our page and returns the token it carries. */
async function tokenFromSetPasswordEmail(to: string): Promise<string> {
  const response = await auth.handler(new Request(emails.lastLinkTo(to)));
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!, baseURL);
  expect(location.pathname).toBe("/reset-password");
  return location.searchParams.get("token")!;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

beforeEach(async () => {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
  await db.delete(schema.users);
  emails.clear();
});

afterAll(async () => {
  await db.delete(schema.users);
  await pool.end();
});

describe("creating a trainer account", () => {
  it("emails a set-password link that lets the new trainer sign in", async () => {
    const result = await createTrainer(deps, ana);
    expect(result.ok).toBe(true);

    expect(emails.sent.map((m) => [m.to, m.subject])).toEqual([[ana.email, "Choose your Gymple password"]]);
    expect(emails.sent[0].text).not.toContain("Typed-By-Admin");
    const token = await tokenFromSetPasswordEmail(ana.email);

    const reset = await post("/reset-password", { token, newPassword: "trainer-pass-1" });
    expect(reset.status).toBe(200);

    const response = await signIn(ana.email, "trainer-pass-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });

  it("uses the link only once", async () => {
    await createTrainer(deps, ana);
    const token = await tokenFromSetPasswordEmail(ana.email);
    await post("/reset-password", { token, newPassword: "trainer-pass-1" });

    const again = await post("/reset-password", { token, newPassword: "attacker-pass-1" });

    expect(again.status).toBe(400);
    expect((await signIn(ana.email, "trainer-pass-1")).status).toBe(200);
  });
});

describe("requesting a new password link", () => {
  it("sends the same email to an existing account and nothing for an unknown one", async () => {
    await createTrainer(deps, ana);
    emails.clear();

    expect((await post("/request-password-reset", { email: ana.email, redirectTo: "/reset-password" })).status).toBe(200);
    expect((await post("/request-password-reset", { email: "nobody@example.com", redirectTo: "/reset-password" })).status).toBe(200);

    expect(emails.sent.map((m) => m.to)).toEqual([ana.email]);
    expect(await tokenFromSetPasswordEmail(ana.email)).toBeTruthy();
  });
});

describe("editing a trainer's email", () => {
  it("sends a verification link to the new address that verifies it", async () => {
    const created = await createTrainer(deps, ana);
    if (!created.ok) throw new Error("setup failed");
    emails.clear();

    const result = await updateTrainer(deps, created.trainer.userId, { ...ana, email: "ana.new@example.com" });

    expect(result).toMatchObject({ ok: true, trainer: { emailVerified: false } });
    expect(emails.sent.map((m) => [m.to, m.subject])).toEqual([["ana.new@example.com", "Verify your email for Gymple"]]);
    const verified = await auth.handler(new Request(emails.lastLinkTo("ana.new@example.com")));
    expect(verified.headers.get("location")).toBe("/verify-email?status=verified");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, created.trainer.userId));
    expect(user).toMatchObject({ email: "ana.new@example.com", emailVerified: true });
  });
});
