import { beforeEach, describe, expect, it } from "vitest";
import type { ExerciseInput } from "../domain/exercise";
import { DuplicateExerciseNameError, type ExerciseRepository } from "../domain/exercise-repository";

export interface ContractFixture {
  repo: ExerciseRepository;
  /** Two existing users. */
  alice: number;
  bob: number;
}

const squat: ExerciseInput = { name: "Squat", muscleGroup: "legs", notes: null };
const bench: ExerciseInput = { name: "Bench press", muscleGroup: "chest", notes: "Flat" };

/** Behavior every ExerciseRepository implementation must have. */
export function describeExerciseRepositoryContract(
  name: string,
  setup: () => Promise<ContractFixture>,
) {
  describe(`ExerciseRepository contract: ${name}`, () => {
    let repo: ExerciseRepository;
    let alice: number;
    let bob: number;

    beforeEach(async () => {
      ({ repo, alice, bob } = await setup());
    });

    it("creates and reads back an exercise", async () => {
      const created = await repo.create(alice, bench);

      expect(created).toEqual({ id: expect.any(Number), ...bench, archivedAt: null });
      expect(await repo.findById(alice, created.id)).toEqual(created);
    });

    it("lists active exercises sorted by name, ignoring case", async () => {
      await repo.create(alice, squat);
      await repo.create(alice, { ...bench, name: "bench press" });
      await repo.create(alice, { ...bench, name: "Curl" });

      const names = (await repo.list(alice, { archived: false })).map((e) => e.name);
      expect(names).toEqual(["bench press", "Curl", "Squat"]);
    });

    it("rejects a duplicate name for the same user, ignoring case", async () => {
      await repo.create(alice, squat);

      await expect(repo.create(alice, { ...squat, name: "SQUAT" })).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
    });

    it("rejects renaming onto an existing name", async () => {
      await repo.create(alice, squat);
      const other = await repo.create(alice, bench);

      await expect(repo.update(alice, other.id, { ...bench, name: "squat" })).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
    });

    it("allows keeping the same name on update", async () => {
      const created = await repo.create(alice, squat);

      const updated = await repo.update(alice, created.id, { ...squat, notes: "High bar" });
      expect(updated).toMatchObject({ name: "Squat", notes: "High bar" });
    });

    it("allows the same name for different users", async () => {
      await repo.create(alice, squat);
      await expect(repo.create(bob, squat)).resolves.toMatchObject({ name: "Squat" });
    });

    it("returns null when updating a missing exercise", async () => {
      expect(await repo.update(alice, 999_999, squat)).toBeNull();
    });

    it("archives and restores, keeping the first archive date", async () => {
      const created = await repo.create(alice, squat);

      expect(await repo.setArchived(alice, created.id, true)).toBe(true);
      const firstArchive = (await repo.findById(alice, created.id))?.archivedAt;
      expect(firstArchive).toBeInstanceOf(Date);

      expect(await repo.setArchived(alice, created.id, true)).toBe(true);
      expect((await repo.findById(alice, created.id))?.archivedAt).toEqual(firstArchive);
      expect(await repo.list(alice, { archived: false })).toEqual([]);
      expect((await repo.list(alice, { archived: true })).map((e) => e.id)).toEqual([created.id]);

      expect(await repo.setArchived(alice, created.id, false)).toBe(true);
      expect(await repo.findById(alice, created.id)).toMatchObject({ archivedAt: null });
    });

    describe("isolates users", () => {
      it("never lists or finds another user's exercises", async () => {
        const bobs = await repo.create(bob, squat);
        await repo.setArchived(bob, (await repo.create(bob, bench)).id, true);

        expect(await repo.list(alice, { archived: false })).toEqual([]);
        expect(await repo.list(alice, { archived: true })).toEqual([]);
        expect(await repo.findById(alice, bobs.id)).toBeNull();
      });

      it("cannot update another user's exercise", async () => {
        const bobs = await repo.create(bob, squat);

        expect(await repo.update(alice, bobs.id, { ...squat, name: "Hacked" })).toBeNull();
        expect(await repo.findById(bob, bobs.id)).toMatchObject({ name: "Squat" });
      });

      it("cannot archive or restore another user's exercise", async () => {
        const bobs = await repo.create(bob, squat);

        expect(await repo.setArchived(alice, bobs.id, true)).toBe(false);
        expect(await repo.findById(bob, bobs.id)).toMatchObject({ archivedAt: null });

        await repo.setArchived(bob, bobs.id, true);
        expect(await repo.setArchived(alice, bobs.id, false)).toBe(false);
        expect((await repo.findById(bob, bobs.id))?.archivedAt).toBeInstanceOf(Date);
      });
    });
  });
}
