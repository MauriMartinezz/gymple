import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryExerciseRepository } from "../testing/in-memory-exercise-repository";
import {
  archiveExercise,
  createExercise,
  listExercises,
  restoreExercise,
  updateExercise,
} from "./exercise-use-cases";

const ALICE = 1;
const BOB = 2;

let repo: InMemoryExerciseRepository;

beforeEach(() => {
  repo = new InMemoryExerciseRepository();
});

describe("createExercise", () => {
  it("creates a valid exercise for the user", async () => {
    const result = await createExercise(repo, ALICE, { name: " Bench press ", muscleGroup: "chest" });

    expect(result).toMatchObject({ ok: true, exercise: { name: "Bench press", muscleGroup: "chest" } });
    expect(await repo.list(ALICE, { archived: false })).toHaveLength(1);
  });

  it("returns field errors and saves nothing when the input is invalid", async () => {
    const result = await createExercise(repo, ALICE, { name: "", muscleGroup: "chest" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { name: "Name is required." } });
    expect(await repo.list(ALICE, { archived: false })).toHaveLength(0);
  });

  it("rejects a name the user already has, even if archived", async () => {
    const first = await createExercise(repo, ALICE, { name: "Squat", muscleGroup: "legs" });
    if (!first.ok) throw new Error("setup failed");
    await archiveExercise(repo, ALICE, first.exercise.id);

    const result = await createExercise(repo, ALICE, { name: "Squat", muscleGroup: "legs" });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { name: 'You already have an exercise named "Squat".' },
    });
  });

  it("allows the same name for different users", async () => {
    await createExercise(repo, ALICE, { name: "Squat", muscleGroup: "legs" });
    const result = await createExercise(repo, BOB, { name: "Squat", muscleGroup: "legs" });

    expect(result.ok).toBe(true);
  });
});

describe("updateExercise", () => {
  it("updates the user's exercise", async () => {
    const created = await createExercise(repo, ALICE, { name: "Row", muscleGroup: "back" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateExercise(repo, ALICE, created.exercise.id, {
      name: "Barbell row",
      muscleGroup: "back",
      notes: "Overhand grip",
    });

    expect(result).toMatchObject({
      ok: true,
      exercise: { name: "Barbell row", notes: "Overhand grip" },
    });
  });

  it("returns field errors for invalid input", async () => {
    const created = await createExercise(repo, ALICE, { name: "Row", muscleGroup: "back" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateExercise(repo, ALICE, created.exercise.id, { name: "", muscleGroup: "back" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { name: "Name is required." } });
  });

  it("rejects renaming to a name the user already has", async () => {
    await createExercise(repo, ALICE, { name: "Squat", muscleGroup: "legs" });
    const other = await createExercise(repo, ALICE, { name: "Lunge", muscleGroup: "legs" });
    if (!other.ok) throw new Error("setup failed");

    const result = await updateExercise(repo, ALICE, other.exercise.id, { name: "Squat", muscleGroup: "legs" });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { name: 'You already have an exercise named "Squat".' },
    });
  });

  it("treats another user's exercise as not found and leaves it unchanged", async () => {
    const bobs = await createExercise(repo, BOB, { name: "Deadlift", muscleGroup: "back" });
    if (!bobs.ok) throw new Error("setup failed");

    const result = await updateExercise(repo, ALICE, bobs.exercise.id, { name: "Hacked", muscleGroup: "back" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await repo.findById(BOB, bobs.exercise.id)).toMatchObject({ name: "Deadlift" });
  });
});

describe("archiveExercise and restoreExercise", () => {
  it("moves an exercise between the active and archived lists", async () => {
    const created = await createExercise(repo, ALICE, { name: "Dip", muscleGroup: "triceps" });
    if (!created.ok) throw new Error("setup failed");

    expect(await archiveExercise(repo, ALICE, created.exercise.id)).toBe(true);
    let lists = await listExercises(repo, ALICE);
    expect(lists.active).toHaveLength(0);
    expect(lists.archived.map((e) => e.name)).toEqual(["Dip"]);

    expect(await restoreExercise(repo, ALICE, created.exercise.id)).toBe(true);
    lists = await listExercises(repo, ALICE);
    expect(lists.active.map((e) => e.name)).toEqual(["Dip"]);
    expect(lists.archived).toHaveLength(0);
  });

  it("cannot archive another user's exercise", async () => {
    const bobs = await createExercise(repo, BOB, { name: "Deadlift", muscleGroup: "back" });
    if (!bobs.ok) throw new Error("setup failed");

    expect(await archiveExercise(repo, ALICE, bobs.exercise.id)).toBe(false);
    expect(await repo.findById(BOB, bobs.exercise.id)).toMatchObject({ archivedAt: null });
  });
});

describe("listExercises", () => {
  it("returns only the user's exercises, sorted by name", async () => {
    await createExercise(repo, ALICE, { name: "Squat", muscleGroup: "legs" });
    await createExercise(repo, ALICE, { name: "bench press", muscleGroup: "chest" });
    await createExercise(repo, BOB, { name: "Curl", muscleGroup: "biceps" });

    const { active } = await listExercises(repo, ALICE);

    expect(active.map((e) => e.name)).toEqual(["bench press", "Squat"]);
  });
});
