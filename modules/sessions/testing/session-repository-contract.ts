import { beforeEach, describe, expect, it } from "vitest";
import type { SetInput } from "../domain/session";
import {
  ActiveSessionExistsError,
  EmptySessionError,
  ExerciseNotAllowedError,
  UnknownRoutineError,
  type SessionRepository,
} from "../domain/session-repository";

/**
 * What each implementation must seed before every test, starting from an
 * empty set of sessions:
 *
 * - two users, `alice` and `bob`;
 * - three exercises owned by alice: `first` and `second` active, `archived`
 *   already archived; one active exercise owned by bob;
 * - two routines owned by alice (`active` and `archived`, the latter
 *   archived) and one active routine owned by bob;
 * - ids that belong to nobody for an exercise and a routine.
 *
 * `archiveExercise` archives one of the seeded exercises mid-test (used to
 * check that sets already logged keep working).
 */
export interface ContractFixture {
  repo: SessionRepository;
  alice: number;
  bob: number;
  aliceExercises: { first: number; second: number; archived: number };
  bobExercise: number;
  missingExercise: number;
  aliceRoutines: { active: number; archived: number };
  bobRoutine: number;
  missingRoutine: number;
  archiveExercise(exerciseId: number): Promise<void>;
}

/** Behavior every SessionRepository implementation must have. */
export function describeSessionRepositoryContract(name: string, setup: () => Promise<ContractFixture>) {
  describe(`SessionRepository contract: ${name}`, () => {
    let f: ContractFixture;
    let repo: SessionRepository;
    let alice: number;
    let bob: number;
    let first: number;
    let second: number;

    const set = (overrides: Partial<SetInput> = {}): SetInput => ({
      weightKg: 80,
      reps: 8,
      rpe: null,
      restSeconds: null,
      ...overrides,
    });

    /** Starts, logs one set per exercise given and finishes a session. */
    async function finishedSession(userId: number, exercises: Array<[number, SetInput]>) {
      const session = await repo.start(userId, null);
      for (const [exerciseId, input] of exercises) await repo.addSet(userId, session.id, exerciseId, input);
      const finished = await repo.finish(userId, session.id, null);
      if (!finished) throw new Error("setup failed");
      return finished;
    }

    beforeEach(async () => {
      f = await setup();
      ({ repo, alice, bob } = f);
      ({ first, second } = f.aliceExercises);
    });

    describe("lifecycle", () => {
      it("starts a free session with no sets", async () => {
        const session = await repo.start(alice, null);

        expect(session).toEqual({
          id: expect.any(Number),
          routineId: null,
          startedAt: expect.any(Date),
          finishedAt: null,
          notes: null,
          sets: [],
        });
        expect(await repo.findById(alice, session.id)).toEqual(session);
        expect(await repo.findActive(alice)).toEqual(session);
      });

      it("starts a session from one of the user's active routines", async () => {
        const session = await repo.start(alice, f.aliceRoutines.active);

        expect(session.routineId).toBe(f.aliceRoutines.active);
        expect(await repo.findActive(alice)).toEqual(session);
      });

      it("logs sets, reading back weights and RPE as numbers", async () => {
        const session = await repo.start(alice, null);

        const logged = await repo.addSet(alice, session.id, first, set({ weightKg: 82.5, reps: 6, rpe: 8.5, restSeconds: 120 }));

        expect(logged).toEqual({
          id: expect.any(Number),
          exerciseId: first,
          setNumber: 1,
          weightKg: 82.5,
          reps: 6,
          rpe: 8.5,
          restSeconds: 120,
          completedAt: expect.any(Date),
        });
        expect((await repo.findById(alice, session.id))?.sets).toEqual([logged]);
      });

      it("numbers sets per exercise and keeps them in logging order", async () => {
        const session = await repo.start(alice, null);

        await repo.addSet(alice, session.id, first, set());
        await repo.addSet(alice, session.id, second, set());
        await repo.addSet(alice, session.id, first, set());
        await repo.addSet(alice, session.id, first, set());

        const sets = (await repo.findById(alice, session.id))?.sets ?? [];
        expect(sets.map((s) => [s.exerciseId, s.setNumber])).toEqual([
          [first, 1],
          [second, 1],
          [first, 2],
          [first, 3],
        ]);
      });

      it("finishes a session with notes, ending it as the active one", async () => {
        const session = await repo.start(alice, null);
        await repo.addSet(alice, session.id, first, set());
        const before = await repo.findById(alice, session.id);

        const finished = await repo.finish(alice, session.id, "Felt strong");

        expect(finished).toEqual({ ...before, finishedAt: expect.any(Date), notes: "Felt strong" });
        expect(await repo.findById(alice, session.id)).toEqual(finished);
        expect(await repo.findActive(alice)).toBeNull();
      });

      it("refuses to finish a session without sets and leaves it active", async () => {
        const session = await repo.start(alice, null);

        await expect(repo.finish(alice, session.id, null)).rejects.toBeInstanceOf(EmptySessionError);
        expect(await repo.findActive(alice)).toEqual(session);
      });

      it("returns null when finishing a missing or already finished session", async () => {
        const finished = await finishedSession(alice, [[first, set()]]);

        expect(await repo.finish(alice, 999_999, null)).toBeNull();
        expect(await repo.finish(alice, finished.id, "Again")).toBeNull();
        expect(await repo.findById(alice, finished.id)).toEqual(finished);
      });
    });

    describe("one active session per user", () => {
      it("rejects starting a second session and names the active one", async () => {
        const active = await repo.start(alice, null);

        const error = await repo.start(alice, f.aliceRoutines.active).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ActiveSessionExistsError);
        expect((error as ActiveSessionExistsError).activeSessionId).toBe(active.id);
        expect(await repo.findActive(alice)).toEqual(active);
      });

      it("allows a new session once the previous one is finished or discarded", async () => {
        await finishedSession(alice, [[first, set()]]);
        const discarded = await repo.start(alice, null);
        await repo.discard(alice, discarded.id);

        expect(await repo.start(alice, null)).toMatchObject({ finishedAt: null });
      });

      it("does not count another user's active session", async () => {
        await repo.start(bob, null);

        expect(await repo.start(alice, null)).toMatchObject({ finishedAt: null });
      });
    });

    describe("starting from a routine", () => {
      it.each(["archived", "bob's", "missing"] as const)("rejects a %s routine and saves nothing", async (kind) => {
        const routineId = { archived: f.aliceRoutines.archived, "bob's": f.bobRoutine, missing: f.missingRoutine }[kind];

        await expect(repo.start(alice, routineId)).rejects.toBeInstanceOf(UnknownRoutineError);
        expect(await repo.findActive(alice)).toBeNull();
      });
    });

    describe("editing sets", () => {
      it("updates a set's values, keeping its exercise, number and completion time", async () => {
        const session = await repo.start(alice, null);
        const logged = await repo.addSet(alice, session.id, first, set());

        const updated = await repo.updateSet(alice, session.id, logged!.id, set({ weightKg: 85.25, reps: 5, rpe: 9, restSeconds: 0 }));

        expect(updated).toEqual({ ...logged, weightKg: 85.25, reps: 5, rpe: 9, restSeconds: 0 });
        expect((await repo.findById(alice, session.id))?.sets).toEqual([updated]);
      });

      it("deletes a set and renumbers the later sets of that exercise", async () => {
        const session = await repo.start(alice, null);
        await repo.addSet(alice, session.id, first, set({ reps: 1 }));
        const middle = await repo.addSet(alice, session.id, first, set({ reps: 2 }));
        await repo.addSet(alice, session.id, second, set({ reps: 9 }));
        await repo.addSet(alice, session.id, first, set({ reps: 3 }));

        expect(await repo.deleteSet(alice, session.id, middle!.id)).toBe(true);

        const sets = (await repo.findById(alice, session.id))?.sets ?? [];
        expect(sets.map((s) => [s.exerciseId, s.setNumber, s.reps])).toEqual([
          [first, 1, 1],
          [second, 1, 9],
          [first, 2, 3],
        ]);
        const next = await repo.addSet(alice, session.id, first, set());
        expect(next?.setNumber).toBe(3);
      });

      it("edits and deletes sets of a finished session", async () => {
        const finished = await finishedSession(alice, [[first, set()], [first, set()]]);
        const [one, two] = finished.sets;

        expect(await repo.updateSet(alice, finished.id, one.id, set({ reps: 10 }))).toMatchObject({ reps: 10 });
        expect(await repo.deleteSet(alice, finished.id, two.id)).toBe(true);
        expect((await repo.findById(alice, finished.id))?.sets).toEqual([{ ...one, reps: 10 }]);
      });

      it("does not add sets to a finished session", async () => {
        const finished = await finishedSession(alice, [[first, set()]]);

        expect(await repo.addSet(alice, finished.id, first, set())).toBeNull();
        expect(await repo.findById(alice, finished.id)).toEqual(finished);
      });

      it("returns null or false for a missing session or a set of another session", async () => {
        const other = await finishedSession(alice, [[first, set()]]);
        const session = await repo.start(alice, null);
        const otherSet = other.sets[0];

        expect(await repo.addSet(alice, 999_999, first, set())).toBeNull();
        expect(await repo.updateSet(alice, session.id, otherSet.id, set({ reps: 1 }))).toBeNull();
        expect(await repo.updateSet(alice, session.id, 999_999, set())).toBeNull();
        expect(await repo.deleteSet(alice, session.id, otherSet.id)).toBe(false);
        expect(await repo.deleteSet(alice, session.id, 999_999)).toBe(false);
        expect(await repo.findById(alice, other.id)).toEqual(other);
      });
    });

    describe("only accepts the user's own exercises", () => {
      it.each(["bob's", "missing"] as const)("rejects a %s exercise and saves nothing", async (kind) => {
        const exerciseId = kind === "missing" ? f.missingExercise : f.bobExercise;
        const session = await repo.start(alice, null);

        await expect(repo.addSet(alice, session.id, exerciseId, set())).rejects.toBeInstanceOf(ExerciseNotAllowedError);
        expect((await repo.findById(alice, session.id))?.sets).toEqual([]);
      });

      it("rejects a first set of an archived exercise", async () => {
        const session = await repo.start(alice, null);

        await expect(repo.addSet(alice, session.id, f.aliceExercises.archived, set())).rejects.toBeInstanceOf(
          ExerciseNotAllowedError,
        );
        expect((await repo.findById(alice, session.id))?.sets).toEqual([]);
      });

      it("keeps logging an exercise archived after it already has sets in the session", async () => {
        const session = await repo.start(alice, null);
        await repo.addSet(alice, session.id, first, set());
        await f.archiveExercise(first);

        expect(await repo.addSet(alice, session.id, first, set())).toMatchObject({ exerciseId: first, setNumber: 2 });
      });

      it("does not let sets in another session unlock an archived exercise", async () => {
        await finishedSession(alice, [[first, set()]]);
        await f.archiveExercise(first);
        const session = await repo.start(alice, null);

        await expect(repo.addSet(alice, session.id, first, set())).rejects.toBeInstanceOf(ExerciseNotAllowedError);
      });
    });

    describe("discarding and deleting", () => {
      it("discards an active session with its sets", async () => {
        const session = await repo.start(alice, null);
        await repo.addSet(alice, session.id, first, set());

        expect(await repo.discard(alice, session.id)).toBe(true);
        expect(await repo.findById(alice, session.id)).toBeNull();
        expect(await repo.findActive(alice)).toBeNull();
      });

      it("does not discard a finished or missing session", async () => {
        const finished = await finishedSession(alice, [[first, set()]]);

        expect(await repo.discard(alice, finished.id)).toBe(false);
        expect(await repo.discard(alice, 999_999)).toBe(false);
        expect(await repo.findById(alice, finished.id)).toEqual(finished);
      });

      it("deletes a finished session with its sets", async () => {
        const finished = await finishedSession(alice, [[first, set()]]);

        expect(await repo.deleteFinished(alice, finished.id)).toBe(true);
        expect(await repo.findById(alice, finished.id)).toBeNull();
        expect(await repo.listFinished(alice)).toEqual([]);
        expect(await repo.lastPerformance(alice, first)).toBeNull();
      });

      it("does not delete an active or missing session through deleteFinished", async () => {
        const active = await repo.start(alice, null);

        expect(await repo.deleteFinished(alice, active.id)).toBe(false);
        expect(await repo.deleteFinished(alice, 999_999)).toBe(false);
        expect(await repo.findActive(alice)).toEqual(active);
      });
    });

    describe("history", () => {
      it("lists only finished sessions, newest first, with their sets", async () => {
        const older = await finishedSession(alice, [[first, set()]]);
        const newer = await finishedSession(alice, [[second, set()], [first, set()]]);
        await repo.start(alice, null);

        expect(await repo.listFinished(alice)).toEqual([newer, older]);
      });

      it("returns the last set of the most recent finished session that logged the exercise", async () => {
        await finishedSession(alice, [[first, set({ weightKg: 70 })]]);
        await finishedSession(alice, [
          [first, set({ weightKg: 80, reps: 8 })],
          [first, set({ weightKg: 85, reps: 6, rpe: 9 })],
          [second, set({ weightKg: 20 })],
        ]);
        await finishedSession(alice, [[second, set({ weightKg: 25 })]]);
        const active = await repo.start(alice, null);
        await repo.addSet(alice, active.id, first, set({ weightKg: 100 }));

        expect(await repo.lastPerformance(alice, first)).toMatchObject({
          exerciseId: first,
          setNumber: 2,
          weightKg: 85,
          reps: 6,
          rpe: 9,
        });
      });

      it("returns null when the exercise was never logged in a finished session", async () => {
        const active = await repo.start(alice, null);
        await repo.addSet(alice, active.id, first, set());

        expect(await repo.lastPerformance(alice, first)).toBeNull();
        expect(await repo.lastPerformance(alice, f.missingExercise)).toBeNull();
      });
    });

    describe("isolates users", () => {
      it("never finds or lists another user's sessions", async () => {
        const bobsFinished = await finishedSession(bob, [[f.bobExercise, set()]]);
        const bobsActive = await repo.start(bob, f.bobRoutine);

        expect(await repo.findById(alice, bobsFinished.id)).toBeNull();
        expect(await repo.findById(alice, bobsActive.id)).toBeNull();
        expect(await repo.findActive(alice)).toBeNull();
        expect(await repo.listFinished(alice)).toEqual([]);
        expect(await repo.lastPerformance(alice, f.bobExercise)).toBeNull();
      });

      it("cannot change another user's sessions or sets", async () => {
        const bobsFinished = await finishedSession(bob, [[f.bobExercise, set()]]);
        const bobsActive = await repo.start(bob, null);
        const bobsSet = await repo.addSet(bob, bobsActive.id, f.bobExercise, set());
        const before = await repo.findById(bob, bobsActive.id);

        expect(await repo.addSet(alice, bobsActive.id, first, set())).toBeNull();
        expect(await repo.updateSet(alice, bobsActive.id, bobsSet!.id, set({ reps: 1 }))).toBeNull();
        expect(await repo.deleteSet(alice, bobsActive.id, bobsSet!.id)).toBe(false);
        expect(await repo.finish(alice, bobsActive.id, "Hacked")).toBeNull();
        expect(await repo.discard(alice, bobsActive.id)).toBe(false);
        expect(await repo.deleteFinished(alice, bobsFinished.id)).toBe(false);

        expect(await repo.findById(bob, bobsActive.id)).toEqual(before);
        expect(await repo.findById(bob, bobsFinished.id)).toEqual(bobsFinished);
      });
    });
  });
}
