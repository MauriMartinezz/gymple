import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineItem } from "@/modules/routines/domain/routine";
import { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import { InMemorySessionRepository } from "../testing/in-memory-session-repository";
import { InMemoryUnitOfWork } from "../testing/in-memory-unit-of-work";

/*
 * Server actions are the app's trust boundary. These tests pin that every
 * action resolves the user from the session (never from the request), that
 * another user's ids behave like missing ones, and that nothing changes when
 * there is no session.
 */

const ALICE = { id: 1, email: "alice@test.dev", name: "Alice" };
const BOB = { id: 2, email: "bob@test.dev", name: "Bob" };
const BENCH = 10;
const DIPS = 11;
const OLD_EXERCISE = 12;
const BOBS_ROW = 20;

/** Mirrors Next: redirect() throws, so nothing after it runs. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  sessions: null as unknown as InMemorySessionRepository,
  routines: null as unknown as InMemoryRoutineRepository,
  uow: null as unknown as InMemoryUnitOfWork,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
/** Names by owner, as the exercises module would resolve them. */
const exerciseNameOf = vi.hoisted(() =>
  vi.fn(async (userId: number, exerciseId: number) => (userId === 1 && exerciseId === 10 ? "Bench press" : null)),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./session-service", () => ({
  get sessionRepository() {
    return state.sessions;
  },
  get sessionUnitOfWork() {
    return state.uow;
  },
  exerciseNameOf,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const {
  deleteSessionAction,
  deleteSetAction,
  discardSessionAction,
  editSetAction,
  finishSessionAction,
  logSetAction,
  startSessionAction,
} = await import("./actions");

const emptySetState = { errors: {}, values: null };
const emptyFinishState = { errors: {}, values: { notes: "" } };

const validSet = { weightKg: "80", reps: "8", rpe: "", restSeconds: "" };

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
  return data;
}

function signIn(user: typeof ALICE | null) {
  state.currentUser = user;
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

const item = (exerciseId: number, overrides: Partial<RoutineItem> = {}): RoutineItem => ({
  exerciseId,
  targetSets: 1,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
  ...overrides,
});

async function routineOf(userId: number, { archived = false, items = [item(userId === ALICE.id ? BENCH : BOBS_ROW)] } = {}) {
  const routine = await state.routines.create(userId, { name: "Push day", description: null, items });
  if (archived) await state.routines.setArchived(userId, routine.id, true);
  state.sessions.addRoutine(userId, routine.id, { archived });
  return routine;
}

/** An active session of the user with the given sets already logged. */
async function activeSession(userId: number, exercises: number[] = [], routineId: number | null = null) {
  const session = await state.sessions.start(userId, routineId);
  for (const exerciseId of exercises) {
    await state.sessions.addSet(userId, session.id, exerciseId, { weightKg: 80, reps: 8, rpe: null, restSeconds: null });
  }
  return (await state.sessions.findById(userId, session.id))!;
}

async function finishedSession(userId: number, exercises: number[]) {
  const session = await activeSession(userId, exercises);
  await state.sessions.finish(userId, session.id, null);
  return (await state.sessions.findById(userId, session.id))!;
}

const sessionOf = (userId: number, id: number) => state.sessions.findById(userId, id);

beforeEach(() => {
  state.sessions = new InMemorySessionRepository();
  state.routines = new InMemoryRoutineRepository();
  state.uow = new InMemoryUnitOfWork(state.sessions, state.routines);
  for (const [userId, exerciseId] of [
    [ALICE.id, BENCH],
    [ALICE.id, DIPS],
    [ALICE.id, OLD_EXERCISE],
    [BOB.id, BOBS_ROW],
  ]) {
    state.sessions.addExercise(userId, exerciseId);
    state.routines.addExercise(userId, exerciseId);
  }
  state.sessions.archiveExercise(OLD_EXERCISE);
  signIn(ALICE);
  refresh.mockReset();
  exerciseNameOf.mockClear();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe("startSessionAction", () => {
  it("starts a free workout for the session user and redirects to it", async () => {
    const url = await redirectOf(() => startSessionAction({}, form({ routineId: "" })));

    expect(url).toBe("/sessions/active");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await state.sessions.findActive(ALICE.id)).toMatchObject({ routineId: null, finishedAt: null });
  });

  it("starts from one of the user's active routines", async () => {
    const routine = await routineOf(ALICE.id);

    const url = await redirectOf(() => startSessionAction({}, form({ routineId: routine.id })));

    expect(url).toBe("/sessions/active");
    expect(await state.sessions.findActive(ALICE.id)).toMatchObject({ routineId: routine.id });
  });

  it("ignores a userId sent in the form", async () => {
    await redirectOf(() => startSessionAction({}, form({ routineId: "", userId: BOB.id })));

    expect(await state.sessions.findActive(BOB.id)).toBeNull();
    expect(await state.sessions.findActive(ALICE.id)).not.toBeNull();
  });

  it("rejects another user's routine and starts nothing", async () => {
    const bobs = await routineOf(BOB.id);

    const result = await startSessionAction({}, form({ routineId: bobs.id }));

    expect(result).toEqual({ error: "This routine can't be started." });
    expect(await state.sessions.findActive(ALICE.id)).toBeNull();
    expect(await state.sessions.findActive(BOB.id)).toBeNull();
  });

  it.each(["abc", "0", "1e3"])("rejects the invalid routine id %j and starts nothing", async (routineId) => {
    const result = await startSessionAction({}, form({ routineId }));

    expect(result).toEqual({ error: "This routine can't be started." });
    expect(await state.sessions.findActive(ALICE.id)).toBeNull();
  });

  it("rejects an archived routine", async () => {
    const routine = await routineOf(ALICE.id, { archived: true });

    const result = await startSessionAction({}, form({ routineId: routine.id }));

    expect(result).toEqual({ error: "This routine can't be started." });
    expect(await state.sessions.findActive(ALICE.id)).toBeNull();
  });

  it("points to the current workout when one is already active", async () => {
    const current = await activeSession(ALICE.id, [BENCH]);

    const result = await startSessionAction({}, form({ routineId: "" }));

    expect(result).toEqual({ error: "Finish or discard your current workout first.", activeSessionId: current.id });
    expect(await state.sessions.findActive(ALICE.id)).toEqual(current);
  });

  it("does nothing without a session", async () => {
    signIn(null);

    const url = await redirectOf(() => startSessionAction({}, form({ routineId: "" })));

    expect(url).toBe("/login");
    expect(await state.sessions.findActive(ALICE.id)).toBeNull();
  });
});

describe("logSetAction", () => {
  it("logs the set on the session user's workout and refreshes the page", async () => {
    const session = await activeSession(ALICE.id);

    const result = await logSetAction(
      emptySetState,
      form({ sessionId: session.id, exerciseId: BENCH, weightKg: "82.5", reps: "8", rpe: "8.5", restSeconds: "90" }),
    );

    expect(result).toEqual({ errors: {}, values: null });
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([
      expect.objectContaining({ exerciseId: BENCH, setNumber: 1, weightKg: 82.5, reps: 8, rpe: 8.5, restSeconds: 90 }),
    ]);
  });

  it("ignores a userId sent in the form", async () => {
    const bobs = await activeSession(BOB.id);

    const result = await logSetAction(
      emptySetState,
      form({ sessionId: bobs.id, exerciseId: BOBS_ROW, userId: BOB.id, ...validSet }),
    );

    expect(result.errors).toEqual({ form: "This workout is no longer active." });
    expect((await sessionOf(BOB.id, bobs.id))!.sets).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects another user's exercise and logs nothing", async () => {
    const session = await activeSession(ALICE.id);

    const result = await logSetAction(emptySetState, form({ sessionId: session.id, exerciseId: BOBS_ROW, ...validSet }));

    expect(result).toEqual({
      errors: { exerciseId: "Choose one of your exercises." },
      values: { exerciseId: String(BOBS_ROW), ...validSet },
    });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([]);
  });

  it("rejects an archived exercise that has no sets in this workout", async () => {
    const session = await activeSession(ALICE.id);

    const result = await logSetAction(
      emptySetState,
      form({ sessionId: session.id, exerciseId: OLD_EXERCISE, ...validSet }),
    );

    expect(result.errors).toEqual({ exerciseId: "Choose one of your exercises." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([]);
  });

  it.each(["", "abc", "0"])("rejects the invalid exercise id %j", async (exerciseId) => {
    const session = await activeSession(ALICE.id);

    const result = await logSetAction(emptySetState, form({ sessionId: session.id, exerciseId, ...validSet }));

    expect(result.errors).toEqual({ exerciseId: "Choose one of your exercises." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([]);
  });

  it("returns field errors and the submitted values for invalid input", async () => {
    const session = await activeSession(ALICE.id);
    const submitted = { exerciseId: String(BENCH), weightKg: "80.555", reps: "0", rpe: "11", restSeconds: "601" };

    const result = await logSetAction(emptySetState, form({ sessionId: session.id, ...submitted }));

    expect(result).toEqual({
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        reps: "Reps must be a whole number from 1 to 100.",
        rpe: "RPE must be a number from 1 to 10 in steps of 0.5.",
        restSeconds: "Rest must be a whole number of seconds from 0 to 600.",
      },
      values: submitted,
    });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not log on a finished workout", async () => {
    const session = await finishedSession(ALICE.id, [BENCH]);

    const result = await logSetAction(emptySetState, form({ sessionId: session.id, exerciseId: BENCH, ...validSet }));

    expect(result.errors).toEqual({ form: "This workout is no longer active." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toHaveLength(1);
  });

  it("does nothing without a session", async () => {
    const session = await activeSession(ALICE.id);
    signIn(null);

    const url = await redirectOf(() =>
      logSetAction(emptySetState, form({ sessionId: session.id, exerciseId: BENCH, ...validSet })),
    );

    expect(url).toBe("/login");
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("editSetAction", () => {
  it("replaces the set's values and refreshes the page", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);
    const [set] = session.sets;

    const result = await editSetAction(
      emptySetState,
      form({ sessionId: session.id, setId: set.id, weightKg: "85", reps: "6", rpe: "9", restSeconds: "120" }),
    );

    expect(result).toEqual({ errors: {}, values: null });
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([
      expect.objectContaining({ id: set.id, weightKg: 85, reps: 6, rpe: 9, restSeconds: 120 }),
    ]);
  });

  it("can fix a set of a finished workout", async () => {
    const session = await finishedSession(ALICE.id, [BENCH]);

    await editSetAction(emptySetState, form({ sessionId: session.id, setId: session.sets[0].id, ...validSet, reps: "10" }));

    expect((await sessionOf(ALICE.id, session.id))!.sets[0]).toMatchObject({ reps: 10 });
  });

  it("treats another user's set as missing, even with a userId in the form", async () => {
    const bobs = await activeSession(BOB.id, [BOBS_ROW]);

    const result = await editSetAction(
      emptySetState,
      form({ sessionId: bobs.id, setId: bobs.sets[0].id, userId: BOB.id, ...validSet, reps: "99" }),
    );

    expect(result.errors).toEqual({ form: "This set no longer exists." });
    expect((await sessionOf(BOB.id, bobs.id))!.sets).toEqual(bobs.sets);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats a set of another of the user's workouts as missing", async () => {
    const finished = await finishedSession(ALICE.id, [BENCH]);
    const active = await activeSession(ALICE.id);

    const result = await editSetAction(
      emptySetState,
      form({ sessionId: active.id, setId: finished.sets[0].id, ...validSet, reps: "12" }),
    );

    expect(result.errors).toEqual({ form: "This set no longer exists." });
    expect((await sessionOf(ALICE.id, finished.id))!.sets).toEqual(finished.sets);
  });

  it.each([
    ["sessionId", "abc"],
    ["setId", "1e3"],
  ])("treats an invalid %s as missing", async (field, value) => {
    const session = await activeSession(ALICE.id, [BENCH]);
    const fields = { sessionId: String(session.id), setId: String(session.sets[0].id), ...validSet, reps: "12" };

    const result = await editSetAction(emptySetState, form({ ...fields, [field]: value }));

    expect(result.errors).toEqual({ form: "This set no longer exists." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
  });

  it("returns field errors and the submitted values for invalid input", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);

    const result = await editSetAction(
      emptySetState,
      form({ sessionId: session.id, setId: session.sets[0].id, weightKg: "-1", reps: "8", rpe: "7.3", restSeconds: "" }),
    );

    expect(result).toEqual({
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        rpe: "RPE must be a number from 1 to 10 in steps of 0.5.",
      },
      values: { exerciseId: "", weightKg: "-1", reps: "8", rpe: "7.3", restSeconds: "" },
    });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
  });

  it("does nothing without a session", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);
    signIn(null);

    const url = await redirectOf(() =>
      editSetAction(emptySetState, form({ sessionId: session.id, setId: session.sets[0].id, ...validSet, reps: "12" })),
    );

    expect(url).toBe("/login");
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
  });
});

describe("deleteSetAction", () => {
  it("deletes the set, renumbers the rest and refreshes the page", async () => {
    const session = await activeSession(ALICE.id, [BENCH, BENCH]);

    const result = await deleteSetAction({}, form({ sessionId: session.id, setId: session.sets[0].id }));

    expect(result).toEqual({});
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual([
      expect.objectContaining({ id: session.sets[1].id, setNumber: 1 }),
    ]);
  });

  it("keeps the last set of a finished workout", async () => {
    const session = await finishedSession(ALICE.id, [BENCH]);

    const result = await deleteSetAction({}, form({ sessionId: session.id, setId: session.sets[0].id }));

    expect(result).toEqual({ error: "Delete the whole workout instead." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats another user's set as missing, even with a userId in the form", async () => {
    const bobs = await activeSession(BOB.id, [BOBS_ROW]);

    const result = await deleteSetAction({}, form({ sessionId: bobs.id, setId: bobs.sets[0].id, userId: BOB.id }));

    expect(result).toEqual({ error: "This set no longer exists." });
    expect((await sessionOf(BOB.id, bobs.id))!.sets).toEqual(bobs.sets);
  });

  it("treats an invalid set id as missing", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);

    const result = await deleteSetAction({}, form({ sessionId: session.id, setId: "x" }));

    expect(result).toEqual({ error: "This set no longer exists." });
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
  });

  it("does nothing without a session", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);
    signIn(null);

    const url = await redirectOf(() => deleteSetAction({}, form({ sessionId: session.id, setId: session.sets[0].id })));

    expect(url).toBe("/login");
    expect((await sessionOf(ALICE.id, session.id))!.sets).toEqual(session.sets);
  });
});

describe("finishSessionAction", () => {
  /** Alice's routine with Bench (1 set target) and a session that logged 2 bench sets and dips. */
  async function sessionWithAdditions() {
    const routine = await routineOf(ALICE.id);
    const session = await activeSession(ALICE.id, [BENCH, BENCH, DIPS], routine.id);
    return { routine, session };
  }

  it("saves the workout only, with notes, and redirects to it", async () => {
    const { routine, session } = await sessionWithAdditions();

    const url = await redirectOf(() =>
      finishSessionAction(emptyFinishState, form({ sessionId: session.id, notes: " Felt strong " })),
    );

    expect(url).toBe(`/sessions/${session.id}`);
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await sessionOf(ALICE.id, session.id)).toMatchObject({ notes: "Felt strong", finishedAt: expect.any(Date) });
    expect((await state.routines.findById(ALICE.id, routine.id))!.items).toEqual(routine.items);
  });

  it("also updates the routine when the user chooses to", async () => {
    const { routine, session } = await sessionWithAdditions();

    const url = await redirectOf(() =>
      finishSessionAction(emptyFinishState, form({ sessionId: session.id, notes: "", updateRoutine: "yes" })),
    );

    expect(url).toBe(`/sessions/${session.id}`);
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).not.toBeNull();
    expect((await state.routines.findById(ALICE.id, routine.id))!.items).toEqual([
      item(BENCH, { targetSets: 2 }),
      item(DIPS, { targetSets: 1, targetRepsMin: 8, targetRepsMax: 8 }),
    ]);
  });

  it("keeps the workout active and the routine unchanged when the routine rejects the update", async () => {
    const routine = await routineOf(ALICE.id, { items: Array.from({ length: 50 }, () => item(BENCH)) });
    const session = await activeSession(ALICE.id, [DIPS], routine.id);

    const result = await finishSessionAction(
      emptyFinishState,
      form({ sessionId: session.id, notes: "Good", updateRoutine: "yes" }),
    );

    expect(result).toEqual({
      errors: { routine: "The routine could not be updated: A routine can have at most 50 exercises." },
      values: { notes: "Good" },
    });
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).toBeNull();
    expect((await state.routines.findById(ALICE.id, routine.id))!.items).toHaveLength(50);
  });

  it("names the exercise, looked up for the signed-in user, when one of its items is rejected", async () => {
    const routine = await routineOf(ALICE.id, { items: [item(BENCH)] });
    const session = await activeSession(ALICE.id, Array.from({ length: 21 }, () => BENCH), routine.id);

    const result = await finishSessionAction(
      emptyFinishState,
      form({ sessionId: session.id, notes: "", updateRoutine: "yes", userId: BOB.id }),
    );

    expect(result).toMatchObject({
      errors: { routine: "The routine could not be updated (Bench press): Sets must be a whole number from 1 to 20." },
    });
    expect(exerciseNameOf).toHaveBeenCalledWith(ALICE.id, BENCH);
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).toBeNull();
  });

  it("asks for at least one set", async () => {
    const session = await activeSession(ALICE.id);

    const result = await finishSessionAction(emptyFinishState, form({ sessionId: session.id, notes: "Short" }));

    expect(result).toEqual({ errors: { sets: "Log at least one set before finishing." }, values: { notes: "Short" } });
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).toBeNull();
  });

  it("returns a notes error and the submitted notes", async () => {
    const session = await activeSession(ALICE.id, [BENCH]);
    const notes = "x".repeat(1001);

    const result = await finishSessionAction(emptyFinishState, form({ sessionId: session.id, notes }));

    expect(result).toEqual({ errors: { notes: "Notes must be at most 1000 characters." }, values: { notes } });
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).toBeNull();
  });

  it("treats another user's workout as missing, even with a userId in the form", async () => {
    const bobs = await activeSession(BOB.id, [BOBS_ROW]);

    const result = await finishSessionAction(
      emptyFinishState,
      form({ sessionId: bobs.id, notes: "", userId: BOB.id }),
    );

    expect(result.errors).toEqual({ form: "This workout is no longer active." });
    expect((await sessionOf(BOB.id, bobs.id))!.finishedAt).toBeNull();
  });

  it("treats an invalid session id as missing", async () => {
    const result = await finishSessionAction(emptyFinishState, form({ sessionId: "abc", notes: "" }));

    expect(result.errors).toEqual({ form: "This workout is no longer active." });
  });

  it("does nothing without a session", async () => {
    const { routine, session } = await sessionWithAdditions();
    signIn(null);

    const url = await redirectOf(() =>
      finishSessionAction(emptyFinishState, form({ sessionId: session.id, notes: "", updateRoutine: "yes" })),
    );

    expect(url).toBe("/login");
    expect((await sessionOf(ALICE.id, session.id))!.finishedAt).toBeNull();
    expect((await state.routines.findById(ALICE.id, routine.id))!.items).toEqual(routine.items);
  });
});

describe.each([
  {
    name: "discardSessionAction",
    action: () => discardSessionAction,
    seed: (userId: number, exerciseId: number) => activeSession(userId, [exerciseId]),
    other: (userId: number, exerciseId: number) => finishedSession(userId, [exerciseId]),
  },
  {
    name: "deleteSessionAction",
    action: () => deleteSessionAction,
    seed: (userId: number, exerciseId: number) => finishedSession(userId, [exerciseId]),
    other: (userId: number, exerciseId: number) => activeSession(userId, [exerciseId]),
  },
])("$name", ({ action, seed, other }) => {
  it("deletes the session user's workout and redirects to the history", async () => {
    const session = await seed(ALICE.id, BENCH);

    const url = await redirectOf(() => action()(form({ sessionId: session.id })));

    expect(url).toBe("/sessions");
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await sessionOf(ALICE.id, session.id)).toBeNull();
  });

  it("leaves another user's workout unchanged, even with a userId in the form", async () => {
    const bobs = await seed(BOB.id, BOBS_ROW);

    await redirectOf(() => action()(form({ sessionId: bobs.id, userId: BOB.id })));

    expect(await sessionOf(BOB.id, bobs.id)).toEqual(bobs);
  });

  it("only applies to a workout in the expected state", async () => {
    const session = await other(ALICE.id, BENCH);

    await redirectOf(() => action()(form({ sessionId: session.id })));

    expect(await sessionOf(ALICE.id, session.id)).toEqual(session);
  });

  it("ignores an invalid id", async () => {
    const session = await seed(ALICE.id, BENCH);

    await redirectOf(() => action()(form({ sessionId: "1e3" })));

    expect(await sessionOf(ALICE.id, session.id)).toEqual(session);
  });

  it("does nothing without a session", async () => {
    const session = await seed(ALICE.id, BENCH);
    signIn(null);

    const url = await redirectOf(() => action()(form({ sessionId: session.id })));

    expect(url).toBe("/login");
    expect(await sessionOf(ALICE.id, session.id)).toEqual(session);
  });
});
