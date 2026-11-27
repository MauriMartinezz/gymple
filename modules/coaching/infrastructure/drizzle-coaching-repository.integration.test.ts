import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { DrizzleTrainerRepository } from "@/modules/trainers/infrastructure/drizzle-trainer-repository";
import { isActiveTrainerOf } from "../application/coaching-use-cases";
import { describeCoachingRepositoryContract } from "../testing/coaching-repository-contract";
import { DrizzleCoachingRepository } from "./drizzle-coaching-repository";

// Runs against a real, disposable Postgres database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = drizzle({ client: pool, schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

// Sessions and routines restrict deleting exercises (and so users): remove them first.
async function deleteAllUsers() {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
  await db.delete(schema.users); // cascades to coaching links, invite codes, trainers, exercises…
}

afterAll(async () => {
  await deleteAllUsers();
  await pool.end();
});

async function addUser({ name, email }: { name: string; email: string }) {
  const [{ id }] = await db.insert(schema.users).values({ name, email }).returning({ id: schema.users.id });
  return id;
}

async function setup() {
  await deleteAllUsers();
  return { repo: new DrizzleCoachingRepository(db), addUser };
}

describeCoachingRepositoryContract("Postgres (Drizzle)", setup);

describe("DrizzleCoachingRepository", () => {
  it("keeps only one of two concurrent joins of the same pair", async () => {
    const { repo } = await setup();
    const ana = await addUser({ name: "Ana", email: "ana@example.com" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });

    const results = await Promise.all([repo.link(ana, bruno), repo.link(ana, bruno)]);

    expect(results.sort()).toEqual([false, true]);
    expect(await repo.listStudents(ana)).toHaveLength(1);
  });

  it("deleting an account deletes its links and code, and nobody else's", async () => {
    const { repo } = await setup();
    const ana = await addUser({ name: "Ana", email: "ana@example.com" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });
    const carla = await addUser({ name: "Carla", email: "carla@example.com" });
    await repo.saveInviteCode(ana, "0123456789abcdef0123456789abcdef");
    await repo.link(ana, bruno);
    await repo.link(carla, bruno);

    await db.delete(schema.users).where(eqId(ana));

    expect(await repo.findTrainerByInviteCode("0123456789abcdef0123456789abcdef")).toBeNull();
    expect((await repo.listTrainers(bruno)).map((t) => t.userId)).toEqual([carla]);
  });

  it("suspends links while the trainer is revoked and restores them on restore", async () => {
    const { repo } = await setup();
    const trainers = new DrizzleTrainerRepository(db);
    const ana = await trainers.createAccountWithTrainer({ name: "Ana", email: "ana@example.com", dni: "12345678" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });
    await repo.link(ana.userId, bruno);
    const deps = { coaching: repo, trainers };

    expect(await isActiveTrainerOf(deps, ana.userId, bruno)).toBe(true);
    await trainers.setRevoked(ana.userId, true);
    expect(await isActiveTrainerOf(deps, ana.userId, bruno)).toBe(false);
    expect(await repo.findStudent(ana.userId, bruno)).not.toBeNull();
    await trainers.setRevoked(ana.userId, false);
    expect(await isActiveTrainerOf(deps, ana.userId, bruno)).toBe(true);
  });
});

function eqId(id: number) {
  return eq(schema.users.id, id);
}
