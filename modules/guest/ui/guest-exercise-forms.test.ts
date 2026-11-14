import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";

// The guest functions must run the same use cases as the server actions.
const useCases = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() }));
vi.mock("@/modules/exercises/application/exercise-use-cases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/exercises/application/exercise-use-cases")>();
  useCases.create.mockImplementation(actual.createExercise);
  useCases.update.mockImplementation(actual.updateExercise);
  useCases.archive.mockImplementation(actual.archiveExercise);
  useCases.restore.mockImplementation(actual.restoreExercise);
  return {
    ...actual,
    createExercise: useCases.create,
    updateExercise: useCases.update,
    archiveExercise: useCases.archive,
    restoreExercise: useCases.restore,
  };
});

const { guestCreateExercise, guestSetExerciseArchived, guestUpdateExercise } = await import("./guest-exercise-forms");

const emptyState = { errors: {}, values: { name: "", muscleGroup: "", notes: "" } };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

let storage: InMemoryGuestStorage;
let repo: BrowserExerciseRepository;
let onSuccess: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  storage = new InMemoryGuestStorage();
  repo = new BrowserExerciseRepository(storage);
  onSuccess = vi.fn<() => void>();
  vi.clearAllMocks();
});

describe("guestCreateExercise", () => {
  it("creates the exercise for the guest through the use case and calls onSuccess", async () => {
    await guestCreateExercise(repo, onSuccess)(emptyState, form({ name: " Bench  press ", muscleGroup: "chest", notes: "" }));

    expect(useCases.create).toHaveBeenCalledWith(repo, GUEST_USER_ID, { name: " Bench  press ", muscleGroup: "chest", notes: "" });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect((await repo.list(GUEST_USER_ID, { archived: false })).map((e) => e.name)).toEqual(["Bench press"]);
  });

  it("returns the same field errors and values as the server action", async () => {
    const result = await guestCreateExercise(repo, onSuccess)(emptyState, form({ name: "", muscleGroup: "chest", notes: "x" }));

    expect(result).toEqual({ errors: { name: "Name is required." }, values: { name: "", muscleGroup: "chest", notes: "x" } });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("reports a duplicate name", async () => {
    await repo.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null });

    const result = await guestCreateExercise(repo, onSuccess)(emptyState, form({ name: "squat", muscleGroup: "legs" }));

    expect(result.errors).toEqual({ name: 'You already have an exercise named "squat".' });
  });

  it("shows a storage failure as a form error instead of failing silently", async () => {
    storage.failWritesWith("quota_exceeded");

    const result = await guestCreateExercise(repo, onSuccess)(emptyState, form({ name: "Squat", muscleGroup: "legs" }));

    expect(result.errors.form).toMatch(/storage for Gymple is full/);
    expect(result.values.name).toBe("Squat");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("guestUpdateExercise", () => {
  it("updates through the use case and calls onSuccess", async () => {
    const exercise = await repo.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null });

    await guestUpdateExercise(repo, exercise.id, onSuccess)(emptyState, form({ name: "Front squat", muscleGroup: "legs" }));

    expect(useCases.update).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(await repo.findById(GUEST_USER_ID, exercise.id)).toMatchObject({ name: "Front squat" });
  });

  it("reports a missing exercise", async () => {
    const result = await guestUpdateExercise(repo, 42, onSuccess)(emptyState, form({ name: "X", muscleGroup: "legs" }));

    expect(result.errors).toEqual({ form: "This exercise no longer exists." });
  });
});

describe("guestSetExerciseArchived", () => {
  it("archives and restores through the use cases", async () => {
    const exercise = await repo.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null });
    const onError = vi.fn();

    await guestSetExerciseArchived(repo, true, onError)(form({ id: String(exercise.id) }));
    expect(useCases.archive).toHaveBeenCalledTimes(1);
    expect((await repo.findById(GUEST_USER_ID, exercise.id))?.archivedAt).toBeInstanceOf(Date);

    await guestSetExerciseArchived(repo, false, onError)(form({ id: String(exercise.id) }));
    expect(useCases.restore).toHaveBeenCalledTimes(1);
    expect((await repo.findById(GUEST_USER_ID, exercise.id))?.archivedAt).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores an invalid id and reports a storage failure", async () => {
    const onError = vi.fn();
    await guestSetExerciseArchived(repo, true, onError)(form({ id: "1e3" }));
    expect(useCases.archive).not.toHaveBeenCalled();

    const exercise = await repo.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null });
    storage.failWritesWith("unavailable");
    await guestSetExerciseArchived(repo, true, onError)(form({ id: String(exercise.id) }));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/not letting Gymple save data/));
  });
});
