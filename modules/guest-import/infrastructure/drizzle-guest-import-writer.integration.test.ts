import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/infrastructure/db/client";
import * as schema from "@/infrastructure/db/schema";
import { DrizzleRoutineRepository } from "@/modules/routines/infrastructure/drizzle-routine-repository";
import { DrizzleSessionRepository } from "@/modules/sessions/infrastructure/drizzle-session-repository";
import { importGuestData } from "../application/import-guest-data";
import { DrizzleGuestImportWriter } from "./drizzle-guest-import-writer";

// Runs against a real, disposable Postgres database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = drizzle({ client: pool, schema });
const writer = new DrizzleGuestImportWriter(db);
const sessions = new DrizzleSessionRepository(db);
const routineRepo = new DrizzleRoutineRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

// session_sets and routine_exercises restrict deleting exercises.
async function deleteSessionsAndRoutines() {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
}

afterAll(async () => {
  await deleteSessionsAndRoutines();
  await pool.end();
});

let alice: number;
let bob: number;
let bobSquat: number;

beforeEach(async () => {
  await deleteSessionsAndRoutines();
  await db.delete(schema.users);
  [{ id: alice }, { id: bob }] = await db
    .insert(schema.users)
    .values([
      { email: "alice@test.dev", name: "Alice" },
      { email: "bob@test.dev", name: "Bob" },
    ])
    .returning({ id: schema.users.id });
  [{ id: bobSquat }] = await db
    .insert(schema.exercises)
    .values({ userId: bob, name: "Squat", muscleGroup: "legs" as const })
    .returning({ id: schema.exercises.id });
});

const exercise = (id: number, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  name,
  muscleGroup: "legs",
  notes: null,
  archivedAt: null,
  ...overrides,
});

const item = (exerciseId: number) => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

const set = (id: number, exerciseId: number, setNumber = 1, weightKg = 80) => ({
  id,
  exerciseId,
  setNumber,
  weightKg,
  reps: 8,
  rpe: 8.5,
  restSeconds: 120,
  completedAt: "2026-11-03T10:05:00.000Z",
});

const workout = (id: number, sets: unknown[], overrides: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  routineId: null,
  startedAt: "2026-11-03T10:00:00.000Z",
  finishedAt: "2026-11-03T11:00:00.000Z",
  notes: "Felt strong",
  sets,
  ...overrides,
});

const payload = (parts: { exercises?: unknown[]; routines?: unknown[]; sessions?: unknown[] }) =>
  JSON.stringify({ version: 1, nextIds: {}, exercises: [], routines: [], sessions: [], ...parts });

async function exercisesOf(userId: number) {
  return db
    .select({ id: schema.exercises.id, name: schema.exercises.name, archivedAt: schema.exercises.archivedAt })
    .from(schema.exercises)
    .where(eq(schema.exercises.userId, userId))
    .orderBy(asc(schema.exercises.name));
}

/** Every row of the tables an import writes, to prove a failed import changed nothing. */
async function allRows() {
  return {
    exercises: await db.select().from(schema.exercises).orderBy(asc(schema.exercises.id)),
    routines: await db.select().from(schema.routines),
    items: await db.select().from(schema.routineExercises),
    sessions: await db.select().from(schema.workoutSessions),
    sets: await db.select().from(schema.sessionSets),
  };
}

describe("guest import into Postgres", () => {
  it("imports everything with new ids, rewritten references, kept dates and archived state", async () => {
    const result = await importGuestData(
      writer,
      alice,
      payload({
        exercises: [exercise(1, "Front squat"), exercise(2, "Lunge", { archivedAt: "2026-10-01T08:00:00.000Z" })],
        routines: [{ id: 3, userId: 1, name: "Legs", description: "Heavy", items: [item(2), item(1)], archivedAt: null }],
        sessions: [workout(4, [set(5, 1), set(6, 2), set(7, 1, 2, 82.5)], { routineId: 3 })],
      }),
    );

    expect(result).toEqual({
      ok: true,
      imported: { exercises: 2, matchedExercises: 0, routines: 1, workouts: 1, sets: 3 },
      skipped: [],
    });
    const [front, lunge] = await exercisesOf(alice);
    expect([front.name, lunge.name]).toEqual(["Front squat", "Lunge"]);
    expect(lunge.archivedAt).toEqual(new Date("2026-10-01T08:00:00.000Z"));

    const [routine] = await routineRepo.list(alice, { archived: false });
    expect(routine).toMatchObject({ name: "Legs", description: "Heavy" });
    expect(routine.items.map((i) => i.exerciseId)).toEqual([lunge.id, front.id]);

    const [session] = await sessions.listFinished(alice);
    expect(session).toMatchObject({
      routineId: routine.id,
      startedAt: new Date("2026-11-03T10:00:00.000Z"),
      finishedAt: new Date("2026-11-03T11:00:00.000Z"),
      notes: "Felt strong",
    });
    expect(session.sets.map((s) => [s.exerciseId, s.setNumber, s.weightKg, s.rpe, s.restSeconds])).toEqual([
      [front.id, 1, 80, 8.5, 120],
      [lunge.id, 1, 80, 8.5, 120],
      [front.id, 2, 82.5, 8.5, 120],
    ]);
    expect(session.sets[0].completedAt).toEqual(new Date("2026-11-03T10:05:00.000Z"));
  });

  it("never touches another user's data, whatever ids and user ids the payload carries", async () => {
    const bobBefore = await allRows();
    const result = await importGuestData(
      writer,
      alice,
      payload({
        // Bob's real exercise id and user id, as if crafted by hand.
        exercises: [exercise(bobSquat, "Squat", { userId: bob })],
        routines: [{ id: 1, userId: bob, name: "Legs", description: null, items: [item(bobSquat)], archivedAt: null }],
        sessions: [workout(1, [set(1, bobSquat)], { userId: bob, routineId: 1 })],
      }),
    );

    expect(result.ok).toBe(true);
    const [aliceSquat] = await exercisesOf(alice);
    expect(aliceSquat.name).toBe("Squat");
    expect(aliceSquat.id).not.toBe(bobSquat);
    const [routine] = await routineRepo.list(alice, { archived: false });
    expect(routine.items[0].exerciseId).toBe(aliceSquat.id);
    const [session] = await sessions.listFinished(alice);
    expect(session.sets[0].exerciseId).toBe(aliceSquat.id);
    // Bob: still exactly his one exercise, no routines, no workouts.
    expect(await exercisesOf(bob)).toEqual([{ id: bobSquat, name: "Squat", archivedAt: null }]);
    expect(await routineRepo.list(bob, { archived: false })).toEqual([]);
    expect(await sessions.listFinished(bob)).toEqual([]);
    expect((await allRows()).exercises.filter((e) => e.userId === bob)).toEqual(
      bobBefore.exercises.filter((e) => e.userId === bob),
    );
  });

  it("maps a guest exercise to the account's exercise of the same name (letter case included)", async () => {
    const [{ id: aliceBench }] = await db
      .insert(schema.exercises)
      .values({ userId: alice, name: "Bench press", muscleGroup: "chest" as const })
      .returning({ id: schema.exercises.id });

    const result = await importGuestData(
      writer,
      alice,
      payload({
        exercises: [exercise(1, "bench PRESS", { muscleGroup: "other" }), exercise(2, "Dips"), exercise(3, "dips")],
        sessions: [workout(4, [set(5, 1), set(6, 2), set(7, 3)])],
      }),
    );

    expect(result).toMatchObject({ ok: true, imported: { exercises: 1, matchedExercises: 2, sets: 3 } });
    const rows = await exercisesOf(alice);
    expect(rows.map((r) => r.name)).toEqual(["Bench press", "Dips"]);
    const dips = rows[1].id;
    const [session] = await sessions.listFinished(alice);
    // Both guest "Dips" exercises share the one imported row, so their sets are numbered together.
    expect(session.sets.map((s) => [s.exerciseId, s.setNumber])).toEqual([
      [aliceBench, 1],
      [dips, 1],
      [dips, 2],
    ]);
  });

  it("imports the workout in progress as active when the account has none", async () => {
    await importGuestData(
      writer,
      alice,
      payload({ exercises: [exercise(1, "Squat")], sessions: [workout(2, [set(3, 1)], { finishedAt: null })] }),
    );

    const active = await sessions.findActive(alice);
    expect(active).toMatchObject({ finishedAt: null, startedAt: new Date("2026-11-03T10:00:00.000Z") });
    expect(active?.sets).toHaveLength(1);
  });

  it("reports the workout in progress as not imported when the account already has one", async () => {
    const own = await sessions.start(alice, null);

    const result = await importGuestData(
      writer,
      alice,
      payload({
        exercises: [exercise(1, "Squat")],
        sessions: [workout(2, [set(3, 1)], { finishedAt: null }), workout(4, [set(5, 1)])],
      }),
    );

    expect(result).toEqual({
      ok: true,
      imported: { exercises: 1, matchedExercises: 0, routines: 0, workouts: 1, sets: 1 },
      skipped: ["Workout in progress: not imported because your account already has one in progress."],
    });
    expect((await sessions.findActive(alice))?.id).toBe(own.id);
    expect(await sessions.listFinished(alice)).toHaveLength(1);
  });

  it("imports the valid part and reports the rest", async () => {
    const result = await importGuestData(
      writer,
      alice,
      payload({
        exercises: [exercise(1, "Squat"), exercise(2, "Broken", { muscleGroup: "wings" })],
        routines: [{ id: 3, userId: 1, name: "Legs", description: null, items: [item(1), item(2)], archivedAt: null }],
        sessions: [workout(4, [set(5, 2)]), workout(6, [set(7, 1), set(8, 2)], { startedAt: "2026-11-02T10:00:00.000Z", finishedAt: "2026-11-02T11:00:00.000Z" })],
      }),
    );

    expect(result).toEqual({
      ok: true,
      imported: { exercises: 1, matchedExercises: 0, routines: 1, workouts: 1, sets: 1 },
      skipped: [
        'Exercise "Broken": Choose a muscle group.',
        'Routine "Legs": 1 exercise left out.',
        "Workout of 2026-11-03: no sets left to import.",
        "Workout of 2026-11-02: 1 set left out.",
      ],
    });
    expect((await exercisesOf(alice)).map((e) => e.name)).toEqual(["Squat"]);
    expect((await routineRepo.list(alice, { archived: false }))[0].items).toHaveLength(1);
    expect((await sessions.listFinished(alice)).map((s) => s.sets.length)).toEqual([1]);
  });

  it("commits in one transaction: a failure part-way imports nothing", async () => {
    const before = await allRows();
    const failing = new DrizzleGuestImportWriter(failOnInsertInto(db, schema.sessionSets));

    await expect(
      importGuestData(
        failing,
        alice,
        payload({
          exercises: [exercise(1, "Front squat")],
          routines: [{ id: 2, userId: 1, name: "Legs", description: null, items: [item(1)], archivedAt: null }],
          sessions: [workout(3, [set(4, 1)])],
        }),
      ),
    ).rejects.toThrow("simulated failure");

    expect(await allRows()).toEqual(before);
  });
});

/** The same database, except that inserting into `table` inside a transaction throws. */
function failOnInsertInto(real: Db, table: unknown): Db {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop !== "transaction") return Reflect.get(target, prop, receiver);
      return (work: (tx: unknown) => Promise<unknown>) =>
        target.transaction((tx) =>
          work(
            new Proxy(tx, {
              get(txTarget, txProp, txReceiver) {
                const value = Reflect.get(txTarget, txProp, txReceiver);
                if (txProp !== "insert") return typeof value === "function" ? value.bind(txTarget) : value;
                return (into: unknown) => {
                  if (into === table) throw new Error("simulated failure");
                  return txTarget.insert(into as never);
                };
              },
            }),
          ),
        );
    },
  }) as Db;
}
