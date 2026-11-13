import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineInput, RoutineItem } from "../domain/routine";
import { InMemoryRoutineRepository } from "../testing/in-memory-routine-repository";

/*
 * Server actions are the app's trust boundary. These tests pin that every
 * action resolves the user from the session (never from the request), and
 * that nothing changes when there is no session.
 */

const ALICE = { id: 1, email: "alice@test.dev", name: "Alice" };
const BOB = { id: 2, email: "bob@test.dev", name: "Bob" };
const ALICE_EXERCISE = 10;
const ALICE_OTHER_EXERCISE = 11;
const BOB_EXERCISE = 20;

/** Mirrors Next: redirect() throws, so nothing after it runs. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  repo: null as unknown as InMemoryRoutineRepository,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./routine-service", () => ({
  get routineRepository() {
    return state.repo;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const { archiveRoutineAction, createRoutineAction, restoreRoutineAction, updateRoutineAction } =
  await import("./actions");

const emptyState = { errors: {}, values: { name: "", description: "", items: [] } };

const validItem = {
  exerciseId: String(ALICE_EXERCISE),
  targetSets: "3",
  targetRepsMin: "8",
  targetRepsMax: "12",
  restSeconds: "90",
  notes: "",
};

type ItemFields = Partial<typeof validItem>;

/** Builds the form the routine form submits: indexed `items.N.field` keys. */
function form(fields: Record<string, string>, items: ItemFields[] = []): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  items.forEach((item, index) => {
    for (const [key, value] of Object.entries({ ...validItem, ...item })) {
      data.append(`items.${index}.${key}`, value);
    }
  });
  return data;
}

function signIn(user: typeof ALICE | null) {
  state.currentUser = user;
}

const storedItem = (exerciseId: number): RoutineItem => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

async function seed(userId: number, input: Partial<RoutineInput> = {}) {
  const exerciseId = userId === ALICE.id ? ALICE_EXERCISE : BOB_EXERCISE;
  return state.repo.create(userId, {
    name: "Push day",
    description: null,
    items: [storedItem(exerciseId)],
    ...input,
  });
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

const routinesOf = (userId: number) => state.repo.list(userId, { archived: false });

beforeEach(() => {
  state.repo = new InMemoryRoutineRepository();
  state.repo.addExercise(ALICE.id, ALICE_EXERCISE);
  state.repo.addExercise(ALICE.id, ALICE_OTHER_EXERCISE);
  state.repo.addExercise(BOB.id, BOB_EXERCISE);
  signIn(ALICE);
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe("createRoutineAction", () => {
  it("creates the routine for the session user, in item order, and redirects to the list", async () => {
    const url = await redirectOf(() =>
      createRoutineAction(
        emptyState,
        form({ name: "Push day", description: "" }, [
          {},
          { exerciseId: String(ALICE_OTHER_EXERCISE), notes: "Slow" },
        ]),
      ),
    );

    expect(url).toBe("/routines");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await routinesOf(ALICE.id)).toEqual([
      expect.objectContaining({
        name: "Push day",
        description: null,
        items: [storedItem(ALICE_EXERCISE), { ...storedItem(ALICE_OTHER_EXERCISE), notes: "Slow" }],
      }),
    ]);
  });

  it("ignores a userId sent in the form", async () => {
    await redirectOf(() =>
      createRoutineAction(emptyState, form({ name: "Push day", userId: String(BOB.id) }, [{}])),
    );

    expect(await routinesOf(BOB.id)).toEqual([]);
    expect(await routinesOf(ALICE.id)).toHaveLength(1);
  });

  it("returns an item error for another user's exercise and saves nothing", async () => {
    const result = await createRoutineAction(
      emptyState,
      form({ name: "Push day" }, [{}, { exerciseId: String(BOB_EXERCISE) }]),
    );

    expect(result.errors).toEqual({
      itemErrors: [undefined, { exerciseId: "Choose one of your exercises." }],
    });
    expect(result.values.items.map((i) => i.exerciseId)).toEqual([
      String(ALICE_EXERCISE),
      String(BOB_EXERCISE),
    ]);
    expect(await routinesOf(ALICE.id)).toEqual([]);
    expect(await routinesOf(BOB.id)).toEqual([]);
  });

  it("returns errors and the submitted values when the input is invalid", async () => {
    const result = await createRoutineAction(
      emptyState,
      form({ name: "", description: "Notes" }, [{ targetSets: "0" }]),
    );

    expect(result).toEqual({
      errors: {
        name: "Name is required.",
        itemErrors: [{ targetSets: "Sets must be a whole number from 1 to 20." }],
      },
      values: { name: "", description: "Notes", items: [{ ...validItem, targetSets: "0" }] },
    });
    expect(await routinesOf(ALICE.id)).toEqual([]);
  });

  it("asks for at least one exercise", async () => {
    const result = await createRoutineAction(emptyState, form({ name: "Push day" }));

    expect(result.errors).toEqual({ items: "Add at least one exercise." });
  });

  it("does nothing without a session", async () => {
    signIn(null);

    const url = await redirectOf(() => createRoutineAction(emptyState, form({ name: "Push day" }, [{}])));

    expect(url).toBe("/login");
    expect(await routinesOf(ALICE.id)).toEqual([]);
  });
});

describe("updateRoutineAction", () => {
  it("replaces the session user's routine and redirects to the list", async () => {
    const routine = await seed(ALICE.id);

    const url = await redirectOf(() =>
      updateRoutineAction(
        routine.id,
        emptyState,
        form({ name: "Pull day" }, [{ exerciseId: String(ALICE_OTHER_EXERCISE) }, {}]),
      ),
    );

    expect(url).toBe("/routines");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await state.repo.findById(ALICE.id, routine.id)).toMatchObject({
      name: "Pull day",
      items: [storedItem(ALICE_OTHER_EXERCISE), storedItem(ALICE_EXERCISE)],
    });
  });

  it("treats another user's routine id as missing and leaves it unchanged", async () => {
    const bobs = await seed(BOB.id, { name: "Leg day" });

    const result = await updateRoutineAction(bobs.id, emptyState, form({ name: "Hacked" }, [{}]));

    expect(result.errors).toEqual({ form: "This routine no longer exists." });
    expect(await state.repo.findById(BOB.id, bobs.id)).toMatchObject({
      name: "Leg day",
      items: [storedItem(BOB_EXERCISE)],
    });
  });

  it.each([0, -1, Number.NaN])("treats the invalid bound id %s as missing", async (id) => {
    const result = await updateRoutineAction(id, emptyState, form({ name: "X" }, [{}]));

    expect(result.errors).toEqual({ form: "This routine no longer exists." });
  });

  it("returns an item error for another user's exercise and leaves the routine unchanged", async () => {
    const routine = await seed(ALICE.id);

    const result = await updateRoutineAction(
      routine.id,
      emptyState,
      form({ name: "Pull day" }, [{ exerciseId: String(BOB_EXERCISE) }]),
    );

    expect(result.errors).toEqual({ itemErrors: [{ exerciseId: "Choose one of your exercises." }] });
    expect(await state.repo.findById(ALICE.id, routine.id)).toMatchObject({
      name: "Push day",
      items: [storedItem(ALICE_EXERCISE)],
    });
  });

  it("returns errors and the submitted values for invalid input", async () => {
    const routine = await seed(ALICE.id);

    const result = await updateRoutineAction(
      routine.id,
      emptyState,
      form({ name: "Pull day" }, [{ targetRepsMin: "12", targetRepsMax: "8" }]),
    );

    expect(result).toEqual({
      errors: { itemErrors: [{ targetRepsMax: "Maximum reps must be at least the minimum." }] },
      values: {
        name: "Pull day",
        description: "",
        items: [{ ...validItem, targetRepsMin: "12", targetRepsMax: "8" }],
      },
    });
    expect(await state.repo.findById(ALICE.id, routine.id)).toMatchObject({ name: "Push day" });
  });

  it("does nothing without a session", async () => {
    const routine = await seed(ALICE.id);
    signIn(null);

    const url = await redirectOf(() =>
      updateRoutineAction(routine.id, emptyState, form({ name: "Hacked" }, [{}])),
    );

    expect(url).toBe("/login");
    expect(await state.repo.findById(ALICE.id, routine.id)).toMatchObject({ name: "Push day" });
  });
});

describe.each([
  { name: "archiveRoutineAction", action: () => archiveRoutineAction, archives: true },
  { name: "restoreRoutineAction", action: () => restoreRoutineAction, archives: false },
])("$name", ({ action, archives }) => {
  /** A routine in the state this action changes from. */
  async function seedFor(userId: number) {
    const routine = await seed(userId);
    if (!archives) await state.repo.setArchived(userId, routine.id, true);
    return routine;
  }

  const isArchived = async (userId: number, id: number) =>
    (await state.repo.findById(userId, id))?.archivedAt !== null;

  it("changes the session user's routine and refreshes the page", async () => {
    const routine = await seedFor(ALICE.id);

    await action()(form({ id: String(routine.id) }));

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await isArchived(ALICE.id, routine.id)).toBe(archives);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves another user's routine unchanged, even with a userId in the form", async () => {
    const bobs = await seedFor(BOB.id);

    await action()(form({ id: String(bobs.id), userId: String(BOB.id) }));

    expect(await isArchived(BOB.id, bobs.id)).toBe(!archives);
  });

  it("ignores an invalid id", async () => {
    const routine = await seedFor(ALICE.id);

    await action()(form({ id: "1e3" }));

    expect(await isArchived(ALICE.id, routine.id)).toBe(!archives);
  });

  it("does nothing without a session", async () => {
    const routine = await seedFor(ALICE.id);
    signIn(null);

    const url = await redirectOf(() => action()(form({ id: String(routine.id) })));

    expect(url).toBe("/login");
    expect(await isArchived(ALICE.id, routine.id)).toBe(!archives);
    expect(refresh).not.toHaveBeenCalled();
  });
});
