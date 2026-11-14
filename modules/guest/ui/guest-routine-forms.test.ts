import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { BrowserRoutineRepository } from "../infrastructure/browser-routine-repository";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";

const useCases = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() }));
vi.mock("@/modules/routines/application/routine-use-cases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/routines/application/routine-use-cases")>();
  useCases.create.mockImplementation(actual.createRoutine);
  useCases.update.mockImplementation(actual.updateRoutine);
  useCases.archive.mockImplementation(actual.archiveRoutine);
  useCases.restore.mockImplementation(actual.restoreRoutine);
  return {
    ...actual,
    createRoutine: useCases.create,
    updateRoutine: useCases.update,
    archiveRoutine: useCases.archive,
    restoreRoutine: useCases.restore,
  };
});

const { guestCreateRoutine, guestSetRoutineArchived, guestUpdateRoutine, loadGuestExerciseOptions } = await import(
  "./guest-routine-forms"
);

const emptyState = { errors: {}, values: { name: "", description: "", items: [] } };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const itemFields = (exerciseId: number, index = 0) => ({
  [`items.${index}.exerciseId`]: String(exerciseId),
  [`items.${index}.targetSets`]: "3",
  [`items.${index}.targetRepsMin`]: "8",
  [`items.${index}.targetRepsMax`]: "12",
  [`items.${index}.restSeconds`]: "90",
  [`items.${index}.notes`]: "",
});

let storage: InMemoryGuestStorage;
let exercises: BrowserExerciseRepository;
let repo: BrowserRoutineRepository;
let squatId: number;
let onSuccess: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  storage = new InMemoryGuestStorage();
  exercises = new BrowserExerciseRepository(storage);
  repo = new BrowserRoutineRepository(storage);
  squatId = (await exercises.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null })).id;
  onSuccess = vi.fn<() => void>();
  vi.clearAllMocks();
});

describe("guestCreateRoutine", () => {
  it("creates the routine through the use case with the shared form parser", async () => {
    await guestCreateRoutine(repo, onSuccess)(emptyState, form({ name: "Legs", description: "", ...itemFields(squatId) }));

    expect(useCases.create).toHaveBeenCalledWith(repo, GUEST_USER_ID, expect.objectContaining({ name: "Legs" }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(await repo.list(GUEST_USER_ID, { archived: false })).toMatchObject([
      { name: "Legs", items: [{ exerciseId: squatId, targetSets: 3 }] },
    ]);
  });

  it("returns validation errors from the domain rules (limits included)", async () => {
    const result = await guestCreateRoutine(repo, onSuccess)(emptyState, form({ name: "Legs" }));
    expect(result.errors).toEqual({ items: "Add at least one exercise." });

    const tooMany = Object.assign({}, ...Array.from({ length: 51 }, (_, i) => itemFields(squatId, i)));
    const limited = await guestCreateRoutine(repo, onSuccess)(emptyState, form({ name: "Legs", ...tooMany }));
    expect(limited.errors).toEqual({ items: "A routine can have at most 50 exercises." });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("rejects an exercise the guest does not have", async () => {
    const result = await guestCreateRoutine(repo, onSuccess)(emptyState, form({ name: "Legs", ...itemFields(999) }));
    expect(result.errors).toEqual({ itemErrors: [{ exerciseId: "Choose one of your exercises." }] });
  });

  it("shows a storage failure as a form error", async () => {
    storage.failWritesWith("quota_exceeded");
    const result = await guestCreateRoutine(repo, onSuccess)(emptyState, form({ name: "Legs", ...itemFields(squatId) }));
    expect(result.errors.form).toMatch(/storage for Gymple is full/);
    expect(result.values.items).toHaveLength(1);
  });
});

describe("guestUpdateRoutine", () => {
  it("updates through the use case or reports a missing routine", async () => {
    const routine = await repo.create(GUEST_USER_ID, {
      name: "Legs",
      description: null,
      items: [{ exerciseId: squatId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null }],
    });

    await guestUpdateRoutine(repo, routine.id, onSuccess)(emptyState, form({ name: "Leg day", ...itemFields(squatId) }));
    expect(useCases.update).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(await repo.findById(GUEST_USER_ID, routine.id)).toMatchObject({ name: "Leg day" });

    const missing = await guestUpdateRoutine(repo, 77, onSuccess)(emptyState, form({ name: "X", ...itemFields(squatId) }));
    expect(missing.errors).toEqual({ form: "This routine no longer exists." });
  });
});

describe("guestSetRoutineArchived", () => {
  it("archives and restores through the use cases", async () => {
    const routine = await repo.create(GUEST_USER_ID, {
      name: "Legs",
      description: null,
      items: [{ exerciseId: squatId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null }],
    });
    const onError = vi.fn();

    await guestSetRoutineArchived(repo, true, onError)(form({ id: String(routine.id) }));
    expect(useCases.archive).toHaveBeenCalledTimes(1);
    await guestSetRoutineArchived(repo, false, onError)(form({ id: String(routine.id) }));
    expect(useCases.restore).toHaveBeenCalledTimes(1);
    expect(await repo.findById(GUEST_USER_ID, routine.id)).toMatchObject({ archivedAt: null });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("loadGuestExerciseOptions", () => {
  it("offers active exercises plus archived ones the routine uses", async () => {
    const curl = await exercises.create(GUEST_USER_ID, { name: "Curl", muscleGroup: "biceps", notes: null });
    const row = await exercises.create(GUEST_USER_ID, { name: "Row", muscleGroup: "back", notes: null });
    await exercises.setArchived(GUEST_USER_ID, curl.id, true);
    await exercises.setArchived(GUEST_USER_ID, row.id, true);

    expect(await loadGuestExerciseOptions(exercises, [curl.id])).toEqual([
      { id: squatId, name: "Squat", archived: false },
      { id: curl.id, name: "Curl", archived: true },
    ]);
  });
});
