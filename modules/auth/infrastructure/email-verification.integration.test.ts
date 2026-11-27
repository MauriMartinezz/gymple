import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { InMemoryEmailSender } from "@/infrastructure/email/testing/in-memory-email-sender";
import { createAuth } from "./create-auth";

// Runs against a real, disposable Postgres database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = drizzle({ client: pool, schema });
const baseURL = "http://localhost:3000";
const emails = new InMemoryEmailSender();
const auth = createAuth({
  db,
  emailSender: emails,
  baseURL,
  secret: "integration-test-secret-integration-test-secret",
  rateLimit: false,
});

const ana = { name: "Ana", email: "ana@example.com", password: "correct-horse-1" };

function post(path: string, body: unknown): Promise<Response> {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify(body),
    }),
  );
}

const signUp = () => post("/sign-up/email", ana);
const signIn = () => post("/sign-in/email", { email: ana.email, password: ana.password });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

beforeEach(async () => {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
  await db.delete(schema.users); // cascades to accounts, sessions and exercises
  emails.clear();
});

afterAll(async () => {
  await db.delete(schema.users);
  await pool.end();
});

describe("sign-up with email verification", () => {
  it("sends a verification link to the new user's email", async () => {
    const response = await signUp();

    expect(response.status).toBe(200);
    expect(emails.sent).toHaveLength(1);
    const [message] = emails.sent;
    expect(message.to).toBe(ana.email);
    expect(message.subject).toBe("Verify your email for Gymple");
    const link = new URL(emails.lastLinkTo(ana.email));
    expect(link.origin + link.pathname).toBe(`${baseURL}/api/auth/verify-email`);
    expect(link.searchParams.get("token")).toBeTruthy();
    expect(link.searchParams.get("callbackURL")).toBe("/verify-email?status=verified");

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, ana.email));
    expect(user).toMatchObject({ name: "Ana", emailVerified: false });
    // No session until the email is verified.
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
  });

  it("refuses to sign in an unverified user and re-sends the link", async () => {
    await signUp();
    emails.clear();

    const response = await signIn();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(emails.sent.map((m) => m.to)).toEqual([ana.email]);
  });

  it("does not reveal that an email is already registered", async () => {
    await signUp();
    emails.clear();

    const again = await signUp();

    expect(again.status).toBe(200);
    expect(emails.sent).toEqual([]);
  });

  it("verifies the email through the link, then lets the user sign in", async () => {
    await signUp();
    const link = emails.lastLinkTo(ana.email);

    const verified = await auth.handler(new Request(link));

    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/verify-email?status=verified");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, ana.email));
    expect(user.emailVerified).toBe(true);

    const response = await signIn();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });

  it("redirects to the result page with an error for a bad token", async () => {
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/verify-email?token=nope&callbackURL=%2Fverify-email%3Fstatus%3Dverified`),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!, baseURL);
    expect(location.pathname).toBe("/verify-email");
    expect(location.searchParams.get("error")).toBe("INVALID_TOKEN");
  });
});
