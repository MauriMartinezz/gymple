import { beforeEach, describe, expect, it } from "vitest";
import type { TrainerInput } from "../domain/trainer";
import {
  AlreadyTrainerError,
  DniTakenError,
  EmailTakenError,
  type TrainerRepository,
} from "../domain/trainer-repository";

export interface ContractFixture {
  repo: TrainerRepository;
  /** Creates a plain, unverified account (no trainer capability) and returns its id. */
  addAccount(account: { name: string; email: string; emailVerified?: boolean }): Promise<number>;
}

const ana: TrainerInput = { name: "Ana", email: "ana@example.com", dni: "12345678" };
const bruno: TrainerInput = { name: "Bruno", email: "bruno@example.com", dni: "2345678" };

/** Behavior every TrainerRepository implementation must have. */
export function describeTrainerRepositoryContract(name: string, setup: () => Promise<ContractFixture>) {
  describe(`TrainerRepository contract: ${name}`, () => {
    let repo: TrainerRepository;
    let addAccount: ContractFixture["addAccount"];

    beforeEach(async () => {
      ({ repo, addAccount } = await setup());
    });

    describe("createAccountWithTrainer", () => {
      it("creates a verified account that is an active trainer", async () => {
        const created = await repo.createAccountWithTrainer(ana);

        expect(created).toEqual({
          userId: expect.any(Number),
          name: "Ana",
          email: "ana@example.com",
          emailVerified: true,
          dni: "12345678",
          status: "active",
          certifiedAt: expect.any(Date),
          revokedAt: null,
        });
        expect(await repo.findByUserId(created.userId)).toEqual(created);
        expect(await repo.findAccountByEmail("ANA@example.com")).toEqual({
          userId: created.userId,
          name: "Ana",
          email: "ana@example.com",
          emailVerified: true,
        });
        expect(await repo.isActiveTrainer(created.userId)).toBe(true);
      });

      it("rejects an email that already has an account, ignoring case, and creates nothing", async () => {
        await addAccount({ name: "Someone", email: "ana@example.com" });

        await expect(
          repo.createAccountWithTrainer({ ...ana, email: "Ana@Example.com" }),
        ).rejects.toBeInstanceOf(EmailTakenError);
        expect(await repo.list()).toEqual([]);
      });

      it("rejects a DNI another trainer has and leaves no account behind", async () => {
        await repo.createAccountWithTrainer(ana);

        await expect(repo.createAccountWithTrainer({ ...bruno, dni: ana.dni })).rejects.toBeInstanceOf(
          DniTakenError,
        );
        expect(await repo.findAccountByEmail(bruno.email)).toBeNull();
        expect((await repo.list()).map((t) => t.email)).toEqual([ana.email]);
      });
    });

    describe("certify", () => {
      it("adds the trainer capability to an existing account without touching it", async () => {
        const id = await addAccount({ name: "Carla", email: "carla@example.com" });

        const trainer = await repo.certify(id, "7654321");

        expect(trainer).toEqual({
          userId: id,
          name: "Carla",
          email: "carla@example.com",
          emailVerified: false,
          dni: "7654321",
          status: "active",
          certifiedAt: expect.any(Date),
          revokedAt: null,
        });
        expect(await repo.isActiveTrainer(id)).toBe(true);
      });

      it("returns null for a missing account", async () => {
        expect(await repo.certify(999_999, "7654321")).toBeNull();
        expect(await repo.list()).toEqual([]);
      });

      it("rejects an account that is already a trainer, active or revoked", async () => {
        const { userId } = await repo.createAccountWithTrainer(ana);

        await expect(repo.certify(userId, "7654321")).rejects.toBeInstanceOf(AlreadyTrainerError);
        await repo.setRevoked(userId, true);
        await expect(repo.certify(userId, "7654321")).rejects.toBeInstanceOf(AlreadyTrainerError);
        expect(await repo.findByUserId(userId)).toMatchObject({ dni: ana.dni });
      });

      it("rejects a DNI that a revoked trainer still holds", async () => {
        const { userId } = await repo.createAccountWithTrainer(ana);
        await repo.setRevoked(userId, true);
        const other = await addAccount({ name: "Carla", email: "carla@example.com" });

        await expect(repo.certify(other, ana.dni)).rejects.toBeInstanceOf(DniTakenError);
        expect(await repo.isActiveTrainer(other)).toBe(false);
        expect(await repo.findByUserId(other)).toBeNull();
      });
    });

    describe("setRevoked", () => {
      it("revokes and restores the capability, keeping the DNI and the first revoke date", async () => {
        const created = await repo.createAccountWithTrainer(ana);

        expect(await repo.setRevoked(created.userId, true)).toBe(true);
        const revoked = await repo.findByUserId(created.userId);
        expect(revoked).toMatchObject({ status: "revoked", dni: ana.dni, revokedAt: expect.any(Date) });
        expect(await repo.isActiveTrainer(created.userId)).toBe(false);

        expect(await repo.setRevoked(created.userId, true)).toBe(true);
        expect((await repo.findByUserId(created.userId))?.revokedAt).toEqual(revoked?.revokedAt);

        expect(await repo.setRevoked(created.userId, false)).toBe(true);
        expect(await repo.findByUserId(created.userId)).toEqual(created);
        expect(await repo.isActiveTrainer(created.userId)).toBe(true);
      });

      it("leaves the account itself untouched", async () => {
        const created = await repo.createAccountWithTrainer(ana);

        await repo.setRevoked(created.userId, true);

        expect(await repo.findAccountByEmail(ana.email)).toEqual({
          userId: created.userId,
          name: "Ana",
          email: "ana@example.com",
          emailVerified: true,
        });
      });

      it("returns false for an account that is not a trainer", async () => {
        const id = await addAccount({ name: "Carla", email: "carla@example.com" });

        expect(await repo.setRevoked(id, true)).toBe(false);
        expect(await repo.setRevoked(999_999, false)).toBe(false);
        expect(await repo.findByUserId(id)).toBeNull();
      });
    });

    describe("update", () => {
      it("edits name and DNI and keeps a verified email verified when it does not change", async () => {
        const created = await repo.createAccountWithTrainer(ana);

        const updated = await repo.update(created.userId, { name: "Ana María", email: "ANA@example.com", dni: "1111111" });

        expect(updated).toMatchObject({ name: "Ana María", dni: "1111111", emailVerified: true });
        expect(await repo.findByUserId(created.userId)).toEqual(updated);
      });

      it("stores a new email unverified", async () => {
        const created = await repo.createAccountWithTrainer(ana);

        const updated = await repo.update(created.userId, { ...ana, email: "ana.new@example.com" });

        expect(updated).toMatchObject({ email: "ana.new@example.com", emailVerified: false });
        expect(await repo.findAccountByEmail(ana.email)).toBeNull();
      });

      it("edits a revoked trainer without restoring it", async () => {
        const created = await repo.createAccountWithTrainer(ana);
        await repo.setRevoked(created.userId, true);

        expect(await repo.update(created.userId, { ...ana, name: "Ana B" })).toMatchObject({
          name: "Ana B",
          status: "revoked",
        });
      });

      it("rejects an email another account uses and changes nothing", async () => {
        const created = await repo.createAccountWithTrainer(ana);
        await addAccount({ name: "Carla", email: "carla@example.com" });

        await expect(
          repo.update(created.userId, { name: "Changed", email: "Carla@example.com", dni: "1111111" }),
        ).rejects.toBeInstanceOf(EmailTakenError);
        expect(await repo.findByUserId(created.userId)).toEqual(created);
      });

      it("rejects a DNI another trainer has and changes nothing", async () => {
        const created = await repo.createAccountWithTrainer(ana);
        await repo.createAccountWithTrainer(bruno);

        await expect(
          repo.update(created.userId, { name: "Changed", email: "changed@example.com", dni: bruno.dni }),
        ).rejects.toBeInstanceOf(DniTakenError);
        expect(await repo.findByUserId(created.userId)).toEqual(created);
      });

      it("returns null for an account that is not a trainer and leaves it unchanged", async () => {
        const id = await addAccount({ name: "Carla", email: "carla@example.com" });

        expect(await repo.update(id, ana)).toBeNull();
        expect(await repo.findAccountByEmail("carla@example.com")).toMatchObject({ userId: id, name: "Carla" });
      });
    });

    describe("list", () => {
      it("lists active and revoked trainers, most recently certified first, and no plain accounts", async () => {
        await addAccount({ name: "Plain", email: "plain@example.com" });
        const first = await repo.createAccountWithTrainer(ana);
        const carla = await addAccount({ name: "Carla", email: "carla@example.com" });
        const second = await repo.createAccountWithTrainer(bruno);
        await repo.certify(carla, "7654321");
        await repo.setRevoked(first.userId, true);

        const list = await repo.list();

        expect(list.map((t) => [t.email, t.status])).toEqual([
          ["carla@example.com", "active"],
          [second.email, "active"],
          [first.email, "revoked"],
        ]);
      });
    });

    describe("isActiveTrainer", () => {
      it("is false for plain and missing accounts", async () => {
        const id = await addAccount({ name: "Plain", email: "plain@example.com" });

        expect(await repo.isActiveTrainer(id)).toBe(false);
        expect(await repo.isActiveTrainer(999_999)).toBe(false);
      });
    });
  });
}
