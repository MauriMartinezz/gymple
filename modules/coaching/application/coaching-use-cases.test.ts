import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";
import {
  getInviteCode,
  isActiveTrainerOf,
  joinTrainer,
  leaveTrainer,
  listStudentsOf,
  listTrainersOf,
  previewJoin,
  regenerateInviteCode,
  removeStudent,
  type CoachingDeps,
} from "./coaching-use-cases";

const CODE_1 = "abcdef0123456789abcdef0123456789";
const CODE_2 = "22222222222222222222222222222222";

let coaching: InMemoryCoachingRepository;
let trainers: InMemoryTrainerRepository;
let codes: string[];
let deps: CoachingDeps;

let ana: number; // active trainer
let bruno: number; // plain user
let carla: number; // plain user
let rita: number; // revoked trainer

/** Adds the same account to both test doubles, keeping their ids aligned. */
function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = coaching.addUser({ name, email });
  expect(trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

beforeEach(async () => {
  coaching = new InMemoryCoachingRepository();
  trainers = new InMemoryTrainerRepository();
  codes = [CODE_1, CODE_2];
  deps = { coaching, trainers, newCode: () => codes.shift() ?? "ffffffffffffffffffffffffffffffff" };

  ana = addPerson("Ana");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  rita = addPerson("Rita");
  await trainers.certify(ana, "12345678");
  await trainers.certify(rita, "2345678");
  await trainers.setRevoked(rita, true);
});

describe("getInviteCode", () => {
  it("creates the active trainer's code once and keeps it", async () => {
    expect(await getInviteCode(deps, ana)).toBe(CODE_1);
    expect(await getInviteCode(deps, ana)).toBe(CODE_1);
    expect(await coaching.findInviteCode(ana)).toBe(CODE_1);
  });

  it("gives nothing to a plain user or a revoked trainer, and creates no code", async () => {
    expect(await getInviteCode(deps, bruno)).toBeNull();
    expect(await getInviteCode(deps, rita)).toBeNull();
    expect(await coaching.findInviteCode(bruno)).toBeNull();
    expect(await coaching.findInviteCode(rita)).toBeNull();
  });
});

describe("regenerateInviteCode", () => {
  it("replaces the code; the old link stops working", async () => {
    await getInviteCode(deps, ana);

    expect(await regenerateInviteCode(deps, ana)).toBe(CODE_2);
    expect(await previewJoin(deps, bruno, CODE_1)).toEqual({ status: "unknown" });
    expect(await previewJoin(deps, bruno, CODE_2)).toMatchObject({ status: "can_join" });
  });

  it("does nothing for a plain user or a revoked trainer", async () => {
    expect(await regenerateInviteCode(deps, bruno)).toBeNull();
    expect(await regenerateInviteCode(deps, rita)).toBeNull();
    expect(await coaching.findInviteCode(bruno)).toBeNull();
  });
});

describe("previewJoin", () => {
  beforeEach(async () => {
    await getInviteCode(deps, ana);
  });

  it("shows the trainer's name to a user who can join", async () => {
    expect(await previewJoin(deps, bruno, CODE_1)).toEqual({
      status: "can_join",
      trainer: { userId: ana, name: "Ana" },
    });
  });

  it("tells the trainer it is their own link", async () => {
    expect(await previewJoin(deps, ana, CODE_1)).toEqual({ status: "own_link" });
  });

  it("tells a student they already train with the trainer", async () => {
    await joinTrainer(deps, bruno, CODE_1);

    expect(await previewJoin(deps, bruno, CODE_1)).toEqual({
      status: "already_student",
      trainer: { userId: ana, name: "Ana" },
    });
  });

  it("says a revoked trainer is not accepting students", async () => {
    await coaching.saveInviteCode(rita, CODE_2);

    expect(await previewJoin(deps, bruno, CODE_2)).toEqual({
      status: "not_accepting",
      trainer: { userId: rita, name: "Rita" },
    });
  });

  it.each(["", "nope", CODE_2, CODE_1.toUpperCase(), ` ${CODE_1}`, undefined])(
    "treats %j as an unknown link",
    async (code) => {
      expect(await previewJoin(deps, bruno, code)).toEqual({ status: "unknown" });
    },
  );
});

describe("joinTrainer", () => {
  beforeEach(async () => {
    await getInviteCode(deps, ana);
  });

  it("makes the user the trainer's student", async () => {
    expect(await joinTrainer(deps, bruno, CODE_1)).toEqual({
      ok: true,
      joined: true,
      trainer: { userId: ana, name: "Ana" },
    });
    expect((await coaching.listStudents(ana)).map((s) => s.userId)).toEqual([bruno]);
    expect(await isActiveTrainerOf(deps, ana, bruno)).toBe(true);
  });

  it("is a no-op the second time", async () => {
    await joinTrainer(deps, bruno, CODE_1);

    expect(await joinTrainer(deps, bruno, CODE_1)).toEqual({
      ok: true,
      joined: false,
      trainer: { userId: ana, name: "Ana" },
    });
    expect(await coaching.listStudents(ana)).toHaveLength(1);
  });

  it("rejects the trainer's own link", async () => {
    expect(await joinTrainer(deps, ana, CODE_1)).toEqual({ ok: false, reason: "own_link" });
    expect(await coaching.listStudents(ana)).toEqual([]);
    expect(await coaching.listTrainers(ana)).toEqual([]);
  });

  it("rejects a revoked trainer's link", async () => {
    await coaching.saveInviteCode(rita, CODE_2);

    expect(await joinTrainer(deps, bruno, CODE_2)).toEqual({ ok: false, reason: "not_accepting" });
    expect(await coaching.listTrainers(bruno)).toEqual([]);
  });

  it("rejects an unknown or regenerated code", async () => {
    expect(await joinTrainer(deps, bruno, "33333333333333333333333333333333")).toEqual({
      ok: false,
      reason: "unknown",
    });
    await regenerateInviteCode(deps, ana);
    expect(await joinTrainer(deps, bruno, CODE_1)).toEqual({ ok: false, reason: "unknown" });
    expect(await coaching.listTrainers(bruno)).toEqual([]);
  });

  it("lets a trainer join another trainer", async () => {
    await coaching.saveInviteCode(rita, CODE_2);
    await trainers.setRevoked(rita, false);

    expect(await joinTrainer(deps, ana, CODE_2)).toMatchObject({ ok: true, joined: true });
    expect(await isActiveTrainerOf(deps, rita, ana)).toBe(true);
    expect(await isActiveTrainerOf(deps, ana, rita)).toBe(false);
  });
});

describe("leaveTrainer", () => {
  it("deletes the link, from the student's side only", async () => {
    await coaching.link(ana, bruno);
    await coaching.link(ana, carla);

    expect(await leaveTrainer(deps, bruno, ana)).toBe(true);
    expect(await leaveTrainer(deps, bruno, ana)).toBe(false);
    expect((await coaching.listStudents(ana)).map((s) => s.userId)).toEqual([carla]);
  });

  it("lets a student leave a revoked trainer", async () => {
    await coaching.link(rita, bruno);

    expect(await leaveTrainer(deps, bruno, rita)).toBe(true);
    expect(await coaching.listTrainers(bruno)).toEqual([]);
  });
});

describe("removeStudent", () => {
  it("deletes the active trainer's link to that student only", async () => {
    await coaching.link(ana, bruno);
    await coaching.link(ana, carla);

    expect(await removeStudent(deps, ana, bruno)).toBe(true);
    expect(await removeStudent(deps, ana, bruno)).toBe(false);
    expect((await coaching.listStudents(ana)).map((s) => s.userId)).toEqual([carla]);
  });

  it("does nothing for a revoked trainer: the link stays suspended", async () => {
    await coaching.link(rita, bruno);

    expect(await removeStudent(deps, rita, bruno)).toBe(false);
    expect((await coaching.listStudents(rita)).map((s) => s.userId)).toEqual([bruno]);
  });

  it("cannot remove someone from another trainer", async () => {
    await coaching.link(rita, bruno);

    expect(await removeStudent(deps, ana, bruno)).toBe(false);
    expect(await coaching.listTrainers(bruno)).toHaveLength(1);
  });
});

describe("listStudentsOf", () => {
  it("lists an active trainer's students", async () => {
    await coaching.link(ana, bruno);
    await coaching.link(rita, carla);

    expect(await listStudentsOf(deps, ana)).toEqual([{ userId: bruno, name: "Bruno", email: "bruno@example.com" }]);
  });

  it("is null for a plain user and for a revoked trainer", async () => {
    await coaching.link(rita, carla);

    expect(await listStudentsOf(deps, bruno)).toBeNull();
    expect(await listStudentsOf(deps, rita)).toBeNull();
  });
});

describe("listTrainersOf", () => {
  it("lists the student's trainers with their status", async () => {
    await coaching.link(ana, bruno);
    await coaching.link(rita, bruno);
    await coaching.link(ana, carla);

    expect(await listTrainersOf(deps, bruno)).toEqual([
      { userId: rita, name: "Rita", status: "inactive" },
      { userId: ana, name: "Ana", status: "active" },
    ]);
    expect(await listTrainersOf(deps, ana)).toEqual([]);
  });

  it("shows a restored trainer as active again", async () => {
    await coaching.link(rita, bruno);
    await trainers.setRevoked(rita, false);

    expect(await listTrainersOf(deps, bruno)).toEqual([{ userId: rita, name: "Rita", status: "active" }]);
  });
});

describe("isActiveTrainerOf", () => {
  it("needs both the link and an active trainer", async () => {
    await coaching.link(ana, bruno);
    await coaching.link(rita, bruno);

    expect(await isActiveTrainerOf(deps, ana, bruno)).toBe(true);
    // Not a student.
    expect(await isActiveTrainerOf(deps, ana, carla)).toBe(false);
    // Revoked: the link is suspended.
    expect(await isActiveTrainerOf(deps, rita, bruno)).toBe(false);
    // Plain user, reverse direction, self.
    expect(await isActiveTrainerOf(deps, carla, bruno)).toBe(false);
    expect(await isActiveTrainerOf(deps, bruno, ana)).toBe(false);
    expect(await isActiveTrainerOf(deps, ana, ana)).toBe(false);
  });

  it("restores access when the trainer is certified again", async () => {
    await coaching.link(rita, bruno);
    await trainers.setRevoked(rita, false);

    expect(await isActiveTrainerOf(deps, rita, bruno)).toBe(true);
  });
});
