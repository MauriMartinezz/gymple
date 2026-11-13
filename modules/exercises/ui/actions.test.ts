import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseInput } from "../domain/exercise";
import { InMemoryExerciseRepository } from "../testing/in-memory-exercise-repository";

/*
 * Server actions are the app's trust boundary. These tests pin that every
 * action resolves the user from the session (never from the request), and
 * that nothing changes when there is no session.
 */

const ALICE = { id: 1, email: "alice@test.dev", name: "Alice" };
const BOB = { id: 2, email: "bob@test.dev", name: "Bob" };

/** Mirrors Next: redirect() throws, so nothing after it runs. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  repo: null as unknown as InMemoryExerciseRepository,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./exercise-service", () => ({
  get exerciseRepository() {
    return state.repo;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const {
  archiveExerciseAction,
  createExerciseAction,
  restoreExerciseAction,
  updateExerciseAction,
} = await import("./actions");

const emptyState = { errors: {}, values: { name: "", muscleGroup: "", notes: "" } };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function signIn(user: typeof ALICE | null) {
  state.currentUser = user;
}

async function seed(userId: number, input: Partial<ExerciseInput> = {}) {
  return state.repo.create(userId, { name: "Squat", muscleGroup: "legs", notes: null, ...input });
}

/** Runs an action and returns the URL it redirected to, if any. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
}

beforeEach(() => {
  state.repo = new InMemoryExerciseRepository();
  signIn(ALICE);
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe("createExerciseAction", () => {
  it("creates the exercise for the session user and redirects to the list", async () => {
    const url = await redirectOf(() =>
      createExerciseAction(emptyState, form({ name: "Bench press", muscleGroup: "chest", notes: "" })),
    );

    expect(url).toBe("/exercises");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect((await state.repo.list(ALICE.id, { archived: false })).map((e) => e.name)).toEqual([
      "Bench press",
    ]);
  });

  it("ignores a userId sent in the form", async () => {
    await redirectOf(() =>
      createExerciseAction(
        emptyState,
        form({ name: "Bench press", muscleGroup: "chest", userId: String(BOB.id) }),
      ),
    );

    expect(await state.repo.list(BOB.id, { archived: false })).toEqual([]);
    expect(await state.repo.list(ALICE.id, { archived: false })).toHaveLength(1);
  });

  it("returns field errors and the submitted values when the input is invalid", async () => {
    const result = await createExerciseAction(emptyState, form({ name: "", muscleGroup: "chest", notes: "x" }));

    expect(result).toEqual({
      errors: { name: "Name is required." },
      values: { name: "", muscleGroup: "chest", notes: "x" },
    });
    expect(await state.repo.list(ALICE.id, { archived: false })).toEqual([]);
  });

  it("does nothing without a session", async () => {
    signIn(null);

    const url = await redirectOf(() =>
      createExerciseAction(emptyState, form({ name: "Bench press", muscleGroup: "chest" })),
    );

    expect(url).toBe("/login");
    expect(await state.repo.list(ALICE.id, { archived: false })).toEqual([]);
  });
});

describe("updateExerciseAction", () => {
  it("updates the session user's exercise and redirects to the list", async () => {
    const exercise = await seed(ALICE.id);

    const url = await redirectOf(() =>
      updateExerciseAction(exercise.id, emptyState, form({ name: "Front squat", muscleGroup: "legs" })),
    );

    expect(url).toBe("/exercises");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await state.repo.findById(ALICE.id, exercise.id)).toMatchObject({ name: "Front squat" });
  });

  it("treats another user's exercise id as missing and leaves it unchanged", async () => {
    const bobs = await seed(BOB.id, { name: "Deadlift", muscleGroup: "back" });

    const result = await updateExerciseAction(bobs.id, emptyState, form({ name: "Hacked", muscleGroup: "back" }));

    expect(result.errors).toEqual({ form: "This exercise no longer exists." });
    expect(await state.repo.findById(BOB.id, bobs.id)).toMatchObject({ name: "Deadlift" });
  });

  it.each([0, -1, Number.NaN])("treats the invalid bound id %s as missing", async (id) => {
    const result = await updateExerciseAction(id, emptyState, form({ name: "X", muscleGroup: "legs" }));

    expect(result.errors).toEqual({ form: "This exercise no longer exists." });
  });

  it("returns field errors for invalid input", async () => {
    const exercise = await seed(ALICE.id);

    const result = await updateExerciseAction(exercise.id, emptyState, form({ name: "", muscleGroup: "legs" }));

    expect(result.errors).toEqual({ name: "Name is required." });
    expect(await state.repo.findById(ALICE.id, exercise.id)).toMatchObject({ name: "Squat" });
  });

  it("does nothing without a session", async () => {
    const exercise = await seed(ALICE.id);
    signIn(null);

    const url = await redirectOf(() =>
      updateExerciseAction(exercise.id, emptyState, form({ name: "Hacked", muscleGroup: "legs" })),
    );

    expect(url).toBe("/login");
    expect(await state.repo.findById(ALICE.id, exercise.id)).toMatchObject({ name: "Squat" });
  });
});

describe.each([
  { name: "archiveExerciseAction", action: () => archiveExerciseAction, archives: true },
  { name: "restoreExerciseAction", action: () => restoreExerciseAction, archives: false },
])("$name", ({ action, archives }) => {
  /** An exercise in the state this action changes from. */
  async function seedFor(userId: number) {
    const exercise = await seed(userId);
    if (!archives) await state.repo.setArchived(userId, exercise.id, true);
    return exercise;
  }

  const isArchived = async (userId: number, id: number) =>
    (await state.repo.findById(userId, id))?.archivedAt !== null;

  it("changes the session user's exercise and refreshes the page", async () => {
    const exercise = await seedFor(ALICE.id);

    await action()(form({ id: String(exercise.id) }));

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await isArchived(ALICE.id, exercise.id)).toBe(archives);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves another user's exercise unchanged", async () => {
    const bobs = await seedFor(BOB.id);

    await action()(form({ id: String(bobs.id) }));

    expect(await isArchived(BOB.id, bobs.id)).toBe(!archives);
  });

  it("ignores an invalid id", async () => {
    const exercise = await seedFor(ALICE.id);

    await action()(form({ id: "1e3" }));

    expect(await isArchived(ALICE.id, exercise.id)).toBe(!archives);
  });

  it("does nothing without a session", async () => {
    const exercise = await seedFor(ALICE.id);
    signIn(null);

    const url = await redirectOf(() => action()(form({ id: String(exercise.id) })));

    expect(url).toBe("/login");
    expect(await isArchived(ALICE.id, exercise.id)).toBe(!archives);
    expect(refresh).not.toHaveBeenCalled();
  });
});
