import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import type { Routine, RoutineItem } from "@/modules/routines/domain/routine";
import { DrizzleRoutineRepository } from "@/modules/routines/infrastructure/drizzle-routine-repository";
import { finishWorkout } from "../application/finish-workout-use-cases";
import { EmptySessionError } from "../domain/session-repository";
import { DrizzleSessionRepository } from "./drizzle-session-repository";
import { DrizzleSessionUnitOfWork } from "./drizzle-session-unit-of-work";

// Runs against a real, disposable MySQL database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = mysql.createPool({ uri: url, connectionLimit: 4 });
const db = drizzle({ client: pool, schema, mode: "default" });
const sessions = new DrizzleSessionRepository(db);
const routines = new DrizzleRoutineRepository(db);
const uow = new DrizzleSessionUnitOfWork(db);
const set = { weightKg: 80, reps: 8, rpe: null, restSeconds: null };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

// session_sets and routine_exercises restrict deleting exercises, so delete
// sessions and routines before users, and leave none behind.
async function deleteSessionsAndRoutines() {
  await db.delete(schema.workoutSessions); // cascades to their sets
  await db.delete(schema.routines); // cascades to their items
}

afterAll(async () => {
  await deleteSessionsAndRoutines();
  await pool.end();
});

let alice: number;
let bench: number;
let dips: number;

beforeEach(async () => {
  await deleteSessionsAndRoutines();
  await db.delete(schema.users); // cascades to exercises
  [{ id: alice }] = await db.insert(schema.users).values({ email: "alice@test.dev", name: "Alice" }).$returningId();
  [{ id: bench }, { id: dips }] = await db
    .insert(schema.exercises)
    .values([
      { userId: alice, name: "Bench press", muscleGroup: "chest" as const },
      { userId: alice, name: "Dips", muscleGroup: "chest" as const },
    ])
    .$returningId();
});

const item = (exerciseId: number): RoutineItem => ({
  exerciseId,
  targetSets: 1,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

/** A routine of `count` bench items and an active session from it with one set of dips. */
async function routineSession(count: number): Promise<{ routine: Routine; sessionId: number }> {
  const routine = await routines.create(alice, {
    name: "Push day",
    description: null,
    items: Array.from({ length: count }, () => item(bench)),
  });
  const session = await sessions.start(alice, routine.id);
  await sessions.addSet(alice, session.id, dips, set);
  return { routine, sessionId: session.id };
}

describe("DrizzleSessionUnitOfWork", () => {
  it("commits the finish and the routine update together", async () => {
    const { routine, sessionId } = await routineSession(1);

    const result = await finishWorkout(uow, alice, sessionId, "", { updateRoutine: true });

    expect(result).toMatchObject({ ok: true, session: { id: sessionId, finishedAt: expect.any(Date) } });
    expect(await sessions.findActive(alice)).toBeNull();
    expect((await routines.findById(alice, routine.id))?.items).toEqual([item(bench), { ...item(dips), targetRepsMax: 8 }]);
  });

  it("rolls back the finish when the routine update is rejected afterwards", async () => {
    // The session is finished first; the 51st exercise then fails validation.
    const { routine, sessionId } = await routineSession(50);

    const result = await finishWorkout(uow, alice, sessionId, "Done", { updateRoutine: true });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { routine: "The routine could not be updated: A routine can have at most 50 exercises." },
    });
    expect(await sessions.findById(alice, sessionId)).toMatchObject({ finishedAt: null, notes: null });
    expect(await routines.findById(alice, routine.id)).toEqual(routine);
  });

  it("finishes and updates the routine only once when two finishes race", async () => {
    const { routine, sessionId } = await routineSession(1);

    const results = await Promise.all([
      finishWorkout(uow, alice, sessionId, "", { updateRoutine: true }),
      finishWorkout(uow, alice, sessionId, "", { updateRoutine: true }),
    ]);

    expect(results.map((r) => (r.ok ? "ok" : r.reason)).sort()).toEqual(["not_found", "ok"]);
    expect((await routines.findById(alice, routine.id))?.items).toEqual([item(bench), { ...item(dips), targetRepsMax: 8 }]);
  });

  it("rolls back a routine update when the finish fails afterwards", async () => {
    const routine = await routines.create(alice, { name: "Push day", description: null, items: [item(bench)] });
    const empty = await sessions.start(alice, routine.id);

    await expect(
      uow.run(async (repos) => {
        await repos.routines.update(alice, routine.id, { name: "Renamed", description: null, items: [item(dips)] });
        await repos.sessions.finish(alice, empty.id, null);
      }),
    ).rejects.toBeInstanceOf(EmptySessionError);

    expect(await routines.findById(alice, routine.id)).toEqual(routine);
    expect(await sessions.findActive(alice)).toMatchObject({ id: empty.id });
  });
});
