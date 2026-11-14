import { beforeEach, describe, expect, it } from "vitest";
import type { CoachingRepository } from "../domain/coaching-repository";

export interface ContractFixture {
  repo: CoachingRepository;
  /** Creates a plain account and returns its id. */
  addUser(user: { name: string; email: string }): Promise<number>;
}

const CODE_A = "0123456789abcdef0123456789abcdef";
const CODE_B = "fedcba9876543210fedcba9876543210";

/** Behavior every CoachingRepository implementation must have. */
export function describeCoachingRepositoryContract(name: string, setup: () => Promise<ContractFixture>) {
  describe(`CoachingRepository contract: ${name}`, () => {
    let repo: CoachingRepository;
    let ana: number;
    let bruno: number;
    let carla: number;
    let dani: number;

    beforeEach(async () => {
      const fixture = await setup();
      repo = fixture.repo;
      ana = await fixture.addUser({ name: "Ana", email: "ana@example.com" });
      bruno = await fixture.addUser({ name: "Bruno", email: "bruno@example.com" });
      carla = await fixture.addUser({ name: "Carla", email: "carla@example.com" });
      dani = await fixture.addUser({ name: "Dani", email: "dani@example.com" });
    });

    describe("invite codes", () => {
      it("has no code until one is saved", async () => {
        expect(await repo.findInviteCode(ana)).toBeNull();
        expect(await repo.findTrainerByInviteCode(CODE_A)).toBeNull();
      });

      it("finds the trainer by the saved code", async () => {
        await repo.saveInviteCode(ana, CODE_A);

        expect(await repo.findInviteCode(ana)).toBe(CODE_A);
        expect(await repo.findTrainerByInviteCode(CODE_A)).toEqual({
          userId: ana,
          name: "Ana",
          email: "ana@example.com",
        });
      });

      it("replaces the code, so the old one stops working", async () => {
        await repo.saveInviteCode(ana, CODE_A);
        await repo.saveInviteCode(ana, CODE_B);

        expect(await repo.findInviteCode(ana)).toBe(CODE_B);
        expect(await repo.findTrainerByInviteCode(CODE_A)).toBeNull();
        expect(await repo.findTrainerByInviteCode(CODE_B)).toMatchObject({ userId: ana });
      });

      it("matches codes exactly", async () => {
        await repo.saveInviteCode(ana, CODE_A);

        expect(await repo.findTrainerByInviteCode(CODE_A.toUpperCase())).toBeNull();
        expect(await repo.findTrainerByInviteCode(CODE_A.slice(0, -1))).toBeNull();
        expect(await repo.findTrainerByInviteCode(`${CODE_A} `)).toBeNull();
      });

      it("keeps each trainer's code separate", async () => {
        await repo.saveInviteCode(ana, CODE_A);
        await repo.saveInviteCode(bruno, CODE_B);

        expect(await repo.findTrainerByInviteCode(CODE_A)).toMatchObject({ userId: ana });
        expect(await repo.findTrainerByInviteCode(CODE_B)).toMatchObject({ userId: bruno });
        expect(await repo.findInviteCode(carla)).toBeNull();
      });
    });

    describe("links", () => {
      it("links a student to a trainer once; linking again is a no-op", async () => {
        expect(await repo.link(ana, bruno)).toBe(true);
        expect(await repo.link(ana, bruno)).toBe(false);

        expect(await repo.listStudents(ana)).toEqual([{ userId: bruno, name: "Bruno", email: "bruno@example.com" }]);
        expect(await repo.listTrainers(bruno)).toEqual([{ userId: ana, name: "Ana", email: "ana@example.com" }]);
      });

      it("is many-to-many, newest link first", async () => {
        await repo.link(ana, carla);
        await repo.link(ana, bruno);
        await repo.link(dani, bruno);

        expect((await repo.listStudents(ana)).map((p) => p.userId)).toEqual([bruno, carla]);
        expect((await repo.listTrainers(bruno)).map((p) => p.userId)).toEqual([dani, ana]);
        expect((await repo.listTrainers(carla)).map((p) => p.userId)).toEqual([ana]);
      });

      it("lets a trainer be another trainer's student", async () => {
        await repo.link(ana, bruno);
        await repo.link(bruno, carla);

        expect((await repo.listTrainers(bruno)).map((p) => p.userId)).toEqual([ana]);
        expect((await repo.listStudents(bruno)).map((p) => p.userId)).toEqual([carla]);
      });

      it("finds a student only through their own trainer", async () => {
        await repo.link(ana, bruno);

        expect(await repo.findStudent(ana, bruno)).toEqual({ userId: bruno, name: "Bruno", email: "bruno@example.com" });
        // The link has a direction.
        expect(await repo.findStudent(bruno, ana)).toBeNull();
        expect(await repo.findStudent(dani, bruno)).toBeNull();
        expect(await repo.findStudent(ana, carla)).toBeNull();
        expect(await repo.findStudent(ana, 999_999)).toBeNull();
      });

      it("unlinks only that pair", async () => {
        await repo.link(ana, bruno);
        await repo.link(ana, carla);
        await repo.link(dani, bruno);

        expect(await repo.unlink(ana, bruno)).toBe(true);
        expect(await repo.unlink(ana, bruno)).toBe(false);
        expect(await repo.unlink(bruno, ana)).toBe(false);

        expect((await repo.listStudents(ana)).map((p) => p.userId)).toEqual([carla]);
        expect((await repo.listTrainers(bruno)).map((p) => p.userId)).toEqual([dani]);
        expect(await repo.findStudent(ana, bruno)).toBeNull();
      });

      it("can link the same pair again after unlinking", async () => {
        await repo.link(ana, bruno);
        await repo.unlink(ana, bruno);

        expect(await repo.link(ana, bruno)).toBe(true);
        expect(await repo.findStudent(ana, bruno)).not.toBeNull();
      });

      it("lists nothing for users without links", async () => {
        await repo.link(ana, bruno);

        expect(await repo.listStudents(carla)).toEqual([]);
        expect(await repo.listTrainers(carla)).toEqual([]);
        expect(await repo.listStudents(bruno)).toEqual([]);
        expect(await repo.listTrainers(ana)).toEqual([]);
      });
    });
  });
}
