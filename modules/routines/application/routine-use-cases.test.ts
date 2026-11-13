import { beforeEach, describe, expect, it } from "vitest";
import type { RawRoutineItemInput } from "../domain/routine";
import { InMemoryRoutineRepository } from "../testing/in-memory-routine-repository";
import {
  archiveRoutine,
  createRoutine,
  getRoutine,
  listRoutines,
  restoreRoutine,
  updateRoutine,
} from "./routine-use-cases";

const ALICE = 1;
const BOB = 2;
const SQUAT = 10;
const LUNGE = 11;
const BOBS_DEADLIFT = 20;

const item = (exerciseId: number | string, overrides: RawRoutineItemInput = {}): RawRoutineItemInput => ({
  exerciseId: String(exerciseId),
  targetSets: "3",
  targetRepsMin: "8",
  targetRepsMax: "12",
  restSeconds: "90",
  ...overrides,
});

let repo: InMemoryRoutineRepository;

beforeEach(() => {
  repo = new InMemoryRoutineRepository();
  repo.addExercise(ALICE, SQUAT);
  repo.addExercise(ALICE, LUNGE);
  repo.addExercise(BOB, BOBS_DEADLIFT);
});

async function createOrFail(userId: number, name: string, exerciseId: number) {
  const result = await createRoutine(repo, userId, { name, items: [item(exerciseId)] });
  if (!result.ok) throw new Error("setup failed");
  return result.routine;
}

describe("createRoutine", () => {
  it("creates a valid routine for the user", async () => {
    const result = await createRoutine(repo, ALICE, {
      name: " Leg   day ",
      items: [item(SQUAT), item(LUNGE, { notes: " Each leg " })],
    });

    expect(result).toEqual({
      ok: true,
      routine: {
        id: expect.any(Number),
        name: "Leg day",
        description: null,
        items: [
          { exerciseId: SQUAT, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null },
          { exerciseId: LUNGE, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: "Each leg" },
        ],
        archivedAt: null,
      },
    });
    expect(await repo.list(ALICE, { archived: false })).toHaveLength(1);
  });

  it("returns field errors and saves nothing when the input is invalid", async () => {
    const result = await createRoutine(repo, ALICE, { name: "", items: [] });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { name: "Name is required.", items: "Add at least one exercise." },
    });
    expect(await repo.list(ALICE, { archived: false })).toHaveLength(0);
  });

  it("rejects items that use another user's or a missing exercise and saves nothing", async () => {
    const result = await createRoutine(repo, ALICE, {
      name: "Leg day",
      items: [item(SQUAT), item(BOBS_DEADLIFT), item(999)],
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: {
        itemErrors: [
          undefined,
          { exerciseId: "Choose one of your exercises." },
          { exerciseId: "Choose one of your exercises." },
        ],
      },
    });
    expect(!result.ok && result.reason === "invalid" && result.errors.itemErrors).toHaveLength(3);
    expect(await repo.list(ALICE, { archived: false })).toHaveLength(0);
  });
});

describe("updateRoutine", () => {
  it("replaces the name, description and items of the user's routine", async () => {
    const created = await createOrFail(ALICE, "Leg day", SQUAT);

    const result = await updateRoutine(repo, ALICE, created.id, {
      name: "Lower body",
      description: "Heavy",
      items: [item(LUNGE), item(SQUAT, { targetSets: "5" })],
    });

    expect(result).toMatchObject({
      ok: true,
      routine: {
        id: created.id,
        name: "Lower body",
        description: "Heavy",
        items: [{ exerciseId: LUNGE }, { exerciseId: SQUAT, targetSets: 5 }],
      },
    });
  });

  it("returns field errors for invalid input and changes nothing", async () => {
    const created = await createOrFail(ALICE, "Leg day", SQUAT);

    const result = await updateRoutine(repo, ALICE, created.id, {
      name: "Leg day",
      items: [item(SQUAT, { targetRepsMin: "10", targetRepsMax: "6" })],
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { itemErrors: [{ targetRepsMax: "Maximum reps must be at least the minimum." }] },
    });
    expect(await repo.findById(ALICE, created.id)).toEqual(created);
  });

  it("rejects another user's exercise and changes nothing", async () => {
    const created = await createOrFail(ALICE, "Leg day", SQUAT);

    const result = await updateRoutine(repo, ALICE, created.id, {
      name: "Leg day",
      items: [item(BOBS_DEADLIFT)],
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { itemErrors: [{ exerciseId: "Choose one of your exercises." }] },
    });
    expect(await repo.findById(ALICE, created.id)).toEqual(created);
  });

  it("treats another user's routine as not found and leaves it unchanged", async () => {
    const bobs = await createOrFail(BOB, "Back day", BOBS_DEADLIFT);

    const result = await updateRoutine(repo, ALICE, bobs.id, { name: "Hacked", items: [item(SQUAT)] });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await repo.findById(BOB, bobs.id)).toEqual(bobs);
  });
});

describe("getRoutine", () => {
  it("returns the user's routine and hides another user's", async () => {
    const own = await createOrFail(ALICE, "Leg day", SQUAT);
    const bobs = await createOrFail(BOB, "Back day", BOBS_DEADLIFT);

    expect(await getRoutine(repo, ALICE, own.id)).toEqual(own);
    expect(await getRoutine(repo, ALICE, bobs.id)).toBeNull();
  });
});

describe("archiveRoutine and restoreRoutine", () => {
  it("moves a routine between the active and archived lists", async () => {
    const created = await createOrFail(ALICE, "Leg day", SQUAT);

    expect(await archiveRoutine(repo, ALICE, created.id)).toBe(true);
    let lists = await listRoutines(repo, ALICE);
    expect(lists.active).toHaveLength(0);
    expect(lists.archived.map((r) => r.name)).toEqual(["Leg day"]);

    expect(await restoreRoutine(repo, ALICE, created.id)).toBe(true);
    lists = await listRoutines(repo, ALICE);
    expect(lists.active.map((r) => r.name)).toEqual(["Leg day"]);
    expect(lists.archived).toHaveLength(0);
  });

  it("cannot archive or restore another user's routine", async () => {
    const bobs = await createOrFail(BOB, "Back day", BOBS_DEADLIFT);

    expect(await archiveRoutine(repo, ALICE, bobs.id)).toBe(false);
    expect(await repo.findById(BOB, bobs.id)).toMatchObject({ archivedAt: null });

    await archiveRoutine(repo, BOB, bobs.id);
    expect(await restoreRoutine(repo, ALICE, bobs.id)).toBe(false);
    expect((await repo.findById(BOB, bobs.id))?.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listRoutines", () => {
  it("returns only the user's routines, sorted by name", async () => {
    await createOrFail(ALICE, "Upper", SQUAT);
    await createOrFail(ALICE, "arms", SQUAT);
    await createOrFail(BOB, "Back day", BOBS_DEADLIFT);

    const { active, archived } = await listRoutines(repo, ALICE);

    expect(active.map((r) => r.name)).toEqual(["arms", "Upper"]);
    expect(archived).toEqual([]);
  });
});
