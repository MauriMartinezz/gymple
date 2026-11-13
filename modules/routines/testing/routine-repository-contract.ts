import { beforeEach, describe, expect, it } from "vitest";
import type { RoutineInput, RoutineItemInput } from "../domain/routine";
import { UnknownExerciseError, type RoutineRepository } from "../domain/routine-repository";

export interface ContractFixture {
  repo: RoutineRepository;
  /** Two existing users. */
  alice: number;
  bob: number;
  /** Two exercises owned by alice (the second one archived) and one owned by bob. */
  aliceExercises: [number, number];
  bobExercise: number;
  /** An exercise id that belongs to nobody. */
  missingExercise: number;
}

/** Behavior every RoutineRepository implementation must have. */
export function describeRoutineRepositoryContract(
  name: string,
  setup: () => Promise<ContractFixture>,
) {
  describe(`RoutineRepository contract: ${name}`, () => {
    let repo: RoutineRepository;
    let alice: number;
    let bob: number;
    let first: number;
    let second: number;
    let bobExercise: number;
    let missingExercise: number;

    const item = (exerciseId: number, overrides: Partial<RoutineItemInput> = {}): RoutineItemInput => ({
      exerciseId,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 90,
      notes: null,
      ...overrides,
    });
    const routine = (overrides: Partial<RoutineInput> = {}): RoutineInput => ({
      name: "Push day",
      description: null,
      items: [item(first)],
      ...overrides,
    });

    beforeEach(async () => {
      let exercises: [number, number];
      ({ repo, alice, bob, aliceExercises: exercises, bobExercise, missingExercise } = await setup());
      [first, second] = exercises;
    });

    it("creates and reads back a routine with its items in order", async () => {
      const input = routine({
        description: "Chest focus",
        items: [item(second, { notes: "Warm up first" }), item(first, { targetSets: 5, restSeconds: 0 })],
      });

      const created = await repo.create(alice, input);

      expect(created).toEqual({ id: expect.any(Number), ...input, archivedAt: null });
      expect(await repo.findById(alice, created.id)).toEqual(created);
    });

    it("allows the same exercise more than once", async () => {
      const created = await repo.create(alice, routine({ items: [item(first), item(second), item(first)] }));

      expect((await repo.findById(alice, created.id))?.items.map((i) => i.exerciseId)).toEqual([
        first,
        second,
        first,
      ]);
    });

    it("lists active routines sorted by name, ignoring case", async () => {
      await repo.create(alice, routine({ name: "Pull day" }));
      await repo.create(alice, routine({ name: "legs" }));
      await repo.create(alice, routine({ name: "Arms" }));

      const names = (await repo.list(alice, { archived: false })).map((r) => r.name);
      expect(names).toEqual(["Arms", "legs", "Pull day"]);
    });

    it("lists routines with their items", async () => {
      const created = await repo.create(alice, routine({ items: [item(second), item(first)] }));

      expect(await repo.list(alice, { archived: false })).toEqual([created]);
    });

    it("updates a routine, replacing the whole item list", async () => {
      const created = await repo.create(alice, routine({ items: [item(first), item(second)] }));
      const input = routine({
        name: "Upper body",
        description: "Edited",
        items: [item(second, { targetRepsMin: 5, targetRepsMax: 5 }), item(first), item(first)],
      });

      const updated = await repo.update(alice, created.id, input);

      expect(updated).toEqual({ id: created.id, ...input, archivedAt: null });
      expect(await repo.findById(alice, created.id)).toEqual(updated);
    });

    it("can shrink the item list on update", async () => {
      const created = await repo.create(alice, routine({ items: [item(first), item(second), item(first)] }));

      await repo.update(alice, created.id, routine({ items: [item(second)] }));

      expect((await repo.findById(alice, created.id))?.items).toEqual([item(second)]);
    });

    it("returns null when updating a missing routine", async () => {
      expect(await repo.update(alice, 999_999, routine())).toBeNull();
    });

    it("returns null or false for a missing routine", async () => {
      expect(await repo.findById(alice, 999_999)).toBeNull();
      expect(await repo.setArchived(alice, 999_999, true)).toBe(false);
    });

    it("archives and restores, keeping the first archive date", async () => {
      const created = await repo.create(alice, routine());

      expect(await repo.setArchived(alice, created.id, true)).toBe(true);
      const firstArchive = (await repo.findById(alice, created.id))?.archivedAt;
      expect(firstArchive).toBeInstanceOf(Date);

      expect(await repo.setArchived(alice, created.id, true)).toBe(true);
      expect((await repo.findById(alice, created.id))?.archivedAt).toEqual(firstArchive);
      expect(await repo.list(alice, { archived: false })).toEqual([]);
      expect((await repo.list(alice, { archived: true })).map((r) => r.id)).toEqual([created.id]);

      expect(await repo.setArchived(alice, created.id, false)).toBe(true);
      expect(await repo.findById(alice, created.id)).toMatchObject({ archivedAt: null });
    });

    describe("only accepts the user's own exercises", () => {
      it("rejects a create with another user's or a missing exercise and saves nothing", async () => {
        const error = await repo
          .create(alice, routine({ items: [item(first), item(bobExercise), item(second), item(missingExercise)] }))
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnknownExerciseError);
        expect((error as UnknownExerciseError).itemIndexes).toEqual([1, 3]);
        expect(await repo.list(alice, { archived: false })).toEqual([]);
        expect(await repo.list(alice, { archived: true })).toEqual([]);
      });

      it("rejects an update with another user's or a missing exercise and changes nothing", async () => {
        const created = await repo.create(alice, routine({ items: [item(first), item(second)] }));

        const error = await repo
          .update(alice, created.id, routine({ name: "Changed", items: [item(missingExercise), item(bobExercise)] }))
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnknownExerciseError);
        expect((error as UnknownExerciseError).itemIndexes).toEqual([0, 1]);
        expect(await repo.findById(alice, created.id)).toEqual(created);
      });
    });

    describe("isolates users", () => {
      it("never lists or finds another user's routines", async () => {
        const bobs = await repo.create(bob, routine({ items: [item(bobExercise)] }));
        await repo.setArchived(bob, (await repo.create(bob, routine({ items: [item(bobExercise)] }))).id, true);

        expect(await repo.list(alice, { archived: false })).toEqual([]);
        expect(await repo.list(alice, { archived: true })).toEqual([]);
        expect(await repo.findById(alice, bobs.id)).toBeNull();
      });

      it("cannot update another user's routine", async () => {
        const bobs = await repo.create(bob, routine({ items: [item(bobExercise)] }));

        expect(await repo.update(alice, bobs.id, routine({ name: "Hacked" }))).toBeNull();
        expect(await repo.findById(bob, bobs.id)).toEqual(bobs);
      });

      it("cannot archive or restore another user's routine", async () => {
        const bobs = await repo.create(bob, routine({ items: [item(bobExercise)] }));

        expect(await repo.setArchived(alice, bobs.id, true)).toBe(false);
        expect(await repo.findById(bob, bobs.id)).toMatchObject({ archivedAt: null });

        await repo.setArchived(bob, bobs.id, true);
        expect(await repo.setArchived(alice, bobs.id, false)).toBe(false);
        expect((await repo.findById(bob, bobs.id))?.archivedAt).toBeInstanceOf(Date);
      });
    });
  });
}
