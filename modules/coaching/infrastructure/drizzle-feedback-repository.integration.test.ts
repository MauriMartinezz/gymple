import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { DrizzleSessionRepository } from "@/modules/sessions/infrastructure/drizzle-session-repository";
import { describeFeedbackRepositoryContract } from "../testing/feedback-repository-contract";
import { DrizzleFeedbackRepository } from "./drizzle-feedback-repository";

// Runs against a real, disposable MySQL database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = mysql.createPool({ uri: url, connectionLimit: 4 });
const db = drizzle({ client: pool, schema, mode: "default" });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

// Sessions and routines restrict deleting exercises (and so users): remove them first.
async function deleteAllUsers() {
  await db.delete(schema.workoutSessions); // cascades to comments
  await db.delete(schema.routines);
  await db.delete(schema.users); // cascades to suggestions, exercises…
}

afterAll(async () => {
  await deleteAllUsers();
  await pool.end();
});

async function addUser({ name, email }: { name: string; email: string }) {
  const [{ id }] = await db.insert(schema.users).values({ name, email }).$returningId();
  return id;
}

async function addExercise(userId: number, name: string) {
  const [{ id }] = await db.insert(schema.exercises).values({ userId, name, muscleGroup: "legs" }).$returningId();
  return id;
}

async function addWorkout(userId: number) {
  const [{ id }] = await db
    .insert(schema.workoutSessions)
    .values({ userId, startedAt: new Date("2026-11-01T10:00:00Z"), finishedAt: new Date("2026-11-01T11:00:00Z") })
    .$returningId();
  return id;
}

async function setup() {
  await deleteAllUsers();
  return { repo: new DrizzleFeedbackRepository(db), addUser, addExercise, addWorkout };
}

describeFeedbackRepositoryContract("MySQL (Drizzle)", setup);

describe("DrizzleFeedbackRepository", () => {
  it("deleting a workout deletes its comments, and nobody else's", async () => {
    const { repo } = await setup();
    const ana = await addUser({ name: "Ana", email: "ana@example.com" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });
    const squat = await addExercise(bruno, "Squat");
    const sessions = new DrizzleSessionRepository(db);
    const done = async () => {
      const session = await sessions.start(bruno, null);
      await sessions.addSet(bruno, session.id, squat, { weightKg: 100, reps: 5, rpe: null, restSeconds: null });
      return (await sessions.finish(bruno, session.id, null))!.id;
    };
    const deleted = await done();
    const kept = await done();
    await repo.addComment({ sessionId: deleted, trainerId: ana, body: "Gone", createdAt: new Date() });
    await repo.addComment({ sessionId: kept, trainerId: ana, body: "Stays", createdAt: new Date() });

    expect(await sessions.deleteFinished(bruno, deleted)).toBe(true);

    expect(await repo.listComments(deleted)).toEqual([]);
    expect((await repo.listComments(kept)).map((c) => c.body)).toEqual(["Stays"]);
  });

  it("keeps one row when the same suggestion is saved twice at once", async () => {
    const { repo } = await setup();
    const ana = await addUser({ name: "Ana", email: "ana@example.com" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });
    const squat = await addExercise(bruno, "Squat");
    const base = { trainerId: ana, studentId: bruno, exerciseId: squat, sets: null, note: null, suggestedAt: new Date() };

    await Promise.all([repo.saveSuggestion({ ...base, weightKg: 80, reps: 5 }), repo.saveSuggestion({ ...base, weightKg: 90, reps: 3 })]);

    expect(await repo.listSuggestionsForStudent(bruno)).toHaveLength(1);
  });

  it("deleting a trainer's account deletes their suggestions and comments", async () => {
    const { repo } = await setup();
    const ana = await addUser({ name: "Ana", email: "ana@example.com" });
    const bruno = await addUser({ name: "Bruno", email: "bruno@example.com" });
    const squat = await addExercise(bruno, "Squat");
    const workout = await addWorkout(bruno);
    await repo.saveSuggestion({ trainerId: ana, studentId: bruno, exerciseId: squat, weightKg: 80, reps: 5, sets: null, note: null, suggestedAt: new Date() });
    await repo.addComment({ sessionId: workout, trainerId: ana, body: "Hi", createdAt: new Date() });

    await db.delete(schema.users).where(eqUser(ana));

    expect(await repo.listSuggestionsForStudent(bruno)).toEqual([]);
    expect(await repo.listComments(workout)).toEqual([]);
  });
});

function eqUser(id: number) {
  return eq(schema.users.id, id);
}
