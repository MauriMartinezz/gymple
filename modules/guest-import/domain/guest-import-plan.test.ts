import { describe, expect, it } from "vitest";
import { planGuestImport, type GuestImportPlan } from "./guest-import-plan";

/*
 * S14: the payload is untrusted. Every record is checked with the existing
 * domain rules; broken records are skipped and reported, records that depend
 * on a skipped one only lose that reference, and nothing here throws.
 */

const exercise = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  name: `Exercise ${id}`,
  muscleGroup: "legs",
  notes: null,
  archivedAt: null,
  ...overrides,
});

const item = (exerciseId: unknown, overrides: Record<string, unknown> = {}) => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
  ...overrides,
});

const routine = (id: number, items: unknown[], overrides: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  name: `Routine ${id}`,
  description: null,
  items,
  archivedAt: null,
  ...overrides,
});

const set = (id: number, exerciseId: unknown, overrides: Record<string, unknown> = {}) => ({
  id,
  exerciseId,
  setNumber: 1,
  weightKg: 80,
  reps: 8,
  rpe: null,
  restSeconds: null,
  completedAt: "2026-11-03T10:05:00.000Z",
  ...overrides,
});

const workout = (id: number, sets: unknown[], overrides: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  routineId: null,
  startedAt: "2026-11-03T10:00:00.000Z",
  finishedAt: "2026-11-03T11:00:00.000Z",
  notes: null,
  sets,
  ...overrides,
});

const snapshot = (parts: { exercises?: unknown; routines?: unknown; sessions?: unknown }) => ({
  version: 1,
  nextIds: { exercise: 99, routine: 99, session: 99, set: 99 },
  exercises: [],
  routines: [],
  sessions: [],
  ...parts,
});

function planOf(raw: unknown): GuestImportPlan {
  const result = planGuestImport(raw);
  if (!result.ok) throw new Error(`expected a plan, got: ${result.message}`);
  return result.plan;
}

describe("planGuestImport", () => {
  it("plans every valid record with the domain-normalized values and keeps dates and archived state", () => {
    const plan = planOf(
      snapshot({
        exercises: [
          exercise(1, { name: "  Back   squat ", notes: "Deep\r\nslow" }),
          exercise(2, { archivedAt: "2026-10-01T00:00:00.000Z" }),
        ],
        routines: [routine(5, [item(2), item(1)], { archivedAt: "2026-10-02T00:00:00.000Z" })],
        sessions: [workout(7, [set(1, 1), set(2, 2, { rpe: 8.5 }), set(3, 1, { weightKg: 82.5 })], { routineId: 5 })],
      }),
    );

    expect(plan.exercises).toEqual([
      { key: 1, input: { name: "Back squat", muscleGroup: "legs", notes: "Deep\nslow" }, archivedAt: null },
      {
        key: 2,
        input: { name: "Exercise 2", muscleGroup: "legs", notes: null },
        archivedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ]);
    expect(plan.routines).toEqual([
      {
        key: 5,
        input: { name: "Routine 5", description: null, items: [item(2), item(1)] },
        archivedAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ]);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0]).toMatchObject({
      routineKey: 5,
      startedAt: new Date("2026-11-03T10:00:00.000Z"),
      finishedAt: new Date("2026-11-03T11:00:00.000Z"),
      notes: null,
    });
    expect(plan.workouts[0].sets.map((s) => [s.exerciseKey, s.input.weightKg, s.input.rpe])).toEqual([
      [1, 80, null],
      [2, 80, 8.5],
      [1, 82.5, null],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips an invalid exercise with the domain's reason and imports the rest", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1), exercise(2, { muscleGroup: "wings" }), exercise(3, { name: "   " }), "junk"],
      }),
    );

    expect(plan.exercises.map((e) => e.key)).toEqual([1]);
    expect(plan.skipped).toEqual([
      'Exercise "Exercise 2": Choose a muscle group.',
      "An exercise: Name is required.",
      "An exercise could not be read.",
    ]);
  });

  it("drops only the broken reference: routine items and sets of a skipped or unknown exercise", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1), exercise(2, { muscleGroup: "wings" })],
        routines: [routine(5, [item(1), item(2), item(42)])],
        sessions: [workout(7, [set(1, 1), set(2, 2), set(3, 42), set(4, 1)])],
      }),
    );

    expect(plan.routines[0].input.items.map((i) => i.exerciseId)).toEqual([1]);
    expect(plan.workouts[0].sets.map((s) => s.exerciseKey)).toEqual([1, 1]);
    expect(plan.skipped).toEqual([
      'Exercise "Exercise 2": Choose a muscle group.',
      'Routine "Routine 5": 2 exercises left out.',
      "Workout of 2026-11-03: 2 sets left out.",
    ]);
  });

  it("drops an invalid routine item but keeps the routine; skips a routine left without items", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1)],
        routines: [
          routine(5, [item(1), item(1, { targetSets: 99 })]),
          routine(6, [item(42)]),
          routine(7, [item(1)], { name: "" }),
        ],
      }),
    );

    expect(plan.routines.map((r) => [r.key, r.input.items.length])).toEqual([[5, 1]]);
    expect(plan.skipped).toEqual([
      'Routine "Routine 5": 1 exercise left out.',
      'Routine "Routine 6": no exercises left to import.',
      "A routine: Name is required.",
    ]);
  });

  it("keeps a workout whose routine was not imported, without the routine", () => {
    const plan = planOf(
      snapshot({ exercises: [exercise(1)], sessions: [workout(7, [set(1, 1)], { routineId: 42 })] }),
    );

    expect(plan.workouts[0].routineKey).toBeNull();
    expect(plan.skipped).toEqual(["Workout of 2026-11-03: its routine was not imported."]);
  });

  it("skips a workout left with no sets, and one with invalid notes", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1)],
        sessions: [
          workout(7, [set(1, 42)]),
          workout(8, [set(2, 1, { reps: 0 })], { startedAt: "2026-11-04T10:00:00.000Z", finishedAt: "2026-11-04T11:00:00.000Z" }),
          workout(9, [set(3, 1)], { notes: "x".repeat(1001), startedAt: "2026-11-05T10:00:00.000Z", finishedAt: "2026-11-05T11:00:00.000Z" }),
          workout(10, [set(4, 1)], { startedAt: "2026-11-06T10:00:00.000Z", finishedAt: "2026-11-06T11:00:00.000Z" }),
        ],
      }),
    );

    expect(plan.workouts.map((w) => w.startedAt.toISOString())).toEqual(["2026-11-06T10:00:00.000Z"]);
    expect(plan.skipped).toEqual([
      "Workout of 2026-11-03: no sets left to import.",
      "Workout of 2026-11-04: no sets left to import.",
      "Workout of 2026-11-05: Notes must be at most 1000 characters.",
    ]);
  });

  it("rejects invalid dates", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1), exercise(2, { archivedAt: "yesterday" })],
        sessions: [
          workout(7, [set(1, 1)], { startedAt: "not a date" }),
          workout(8, [set(2, 1)], { startedAt: "2999-01-01T00:00:00.000Z", finishedAt: null }),
          workout(9, [set(3, 1)], { finishedAt: "2026-11-03T09:00:00.000Z" }),
          workout(10, [set(4, 1, { completedAt: 12 }), set(5, 1)], { startedAt: "2026-11-06T10:00:00.000Z", finishedAt: "2026-11-06T11:00:00.000Z" }),
        ],
      }),
    );

    expect(plan.exercises.map((e) => e.key)).toEqual([1]);
    expect(plan.workouts.map((w) => w.sets.length)).toEqual([1]);
    expect(plan.skipped).toEqual([
      'Exercise "Exercise 2": invalid date.',
      "A workout: invalid date.",
      "A workout: invalid date.",
      "Workout of 2026-11-03: it finishes before it starts.",
      "Workout of 2026-11-06: 1 set left out.",
    ]);
  });

  it("treats a repeated id as broken, so references stay unambiguous", () => {
    const plan = planOf(snapshot({ exercises: [exercise(1), exercise(1, { name: "Other" })] }));

    expect(plan.exercises.map((e) => e.input.name)).toEqual(["Exercise 1"]);
    expect(plan.skipped).toEqual(['Exercise "Other": its id is repeated.']);
  });

  it("plans at most one active workout, the most recently started", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1)],
        sessions: [
          workout(7, [set(1, 1)], { finishedAt: null, startedAt: "2026-11-03T10:00:00.000Z" }),
          workout(8, [set(2, 1)], { finishedAt: null, startedAt: "2026-11-04T10:00:00.000Z" }),
        ],
      }),
    );

    expect(plan.workouts.map((w) => [w.startedAt.toISOString(), w.finishedAt])).toEqual([
      ["2026-11-04T10:00:00.000Z", null],
    ]);
    expect(plan.skipped).toEqual(["Workout of 2026-11-03: only one workout can be in progress."]);
  });

  it("ignores user ids in the payload: nothing in the plan carries one", () => {
    const plan = planOf(
      snapshot({
        exercises: [exercise(1, { userId: 2 })],
        routines: [routine(5, [item(1)], { userId: 2 })],
        sessions: [workout(7, [set(1, 1)], { userId: 2 })],
      }),
    );

    expect(JSON.stringify(plan)).not.toContain("userId");
  });

  it("reports an unknown shape instead of throwing", () => {
    for (const raw of [null, "text", 42, [], { version: 2 }, { version: "1" }]) {
      expect(planGuestImport(raw)).toEqual({ ok: false, message: expect.stringMatching(/nothing was imported/i) });
    }
  });

  it("reports a collection that is not a list and keeps going", () => {
    const plan = planOf(snapshot({ exercises: [exercise(1)], routines: "nope", sessions: { a: 1 } }));

    expect(plan.exercises).toHaveLength(1);
    expect(plan.skipped).toEqual(["The routines could not be read.", "The workouts could not be read."]);
  });

  it("reads a snapshot without workouts as having none", () => {
    const plan = planOf({ version: 1, exercises: [exercise(1)], routines: [] });

    expect(plan.workouts).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});
