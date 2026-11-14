import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";

/*
 * Coaching actions are a trust boundary. These tests pin that every action
 * takes the acting user from the session (requireUser), never from the form,
 * that a revoked trainer cannot act as one, and that a signed-out user
 * changes nothing.
 */

const CODE = "abcdef0123456789abcdef0123456789";

/** Mirrors Next: redirect() throws, so nothing after it runs. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  coaching: null as unknown as InMemoryCoachingRepository,
  trainers: null as unknown as InMemoryTrainerRepository,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./coaching-deps", () => ({
  get coachingDeps() {
    return {
      coaching: state.coaching,
      trainers: state.trainers,
      newCode: () => "fedcba9876543210fedcba9876543210",
    };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const { joinTrainerAction, leaveTrainerAction, regenerateInviteCodeAction, removeStudentAction } = await import(
  "./actions"
);

let ana: number; // active trainer
let bruno: number;
let carla: number;
let rita: number; // revoked trainer

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = state.coaching.addUser({ name, email });
  expect(state.trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

function signIn(id: number) {
  state.currentUser = { id, email: `${id}@example.com`, name: `User ${id}` };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function outcome<T>(run: () => Promise<T>): Promise<{ redirect: string } | { result: T }> {
  try {
    return { result: await run() };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    throw error;
  }
}

const studentsOf = async (trainerId: number) => (await state.coaching.listStudents(trainerId)).map((s) => s.userId);

beforeEach(async () => {
  state.coaching = new InMemoryCoachingRepository();
  state.trainers = new InMemoryTrainerRepository();
  ana = addPerson("Ana");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  rita = addPerson("Rita");
  await state.trainers.certify(ana, "12345678");
  await state.trainers.certify(rita, "2345678");
  await state.trainers.setRevoked(rita, true);
  await state.coaching.saveInviteCode(ana, CODE);
  state.currentUser = null;
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe("joinTrainerAction", () => {
  it("makes the session user a student and goes to their trainers", async () => {
    signIn(bruno);

    // A forged user id in the form is ignored.
    const result = await outcome(() => joinTrainerAction({}, form({ code: CODE, userId: String(carla) })));

    expect(result).toEqual({ redirect: "/trainers" });
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await studentsOf(ana)).toEqual([bruno]);
  });

  it("is a no-op the second time", async () => {
    signIn(bruno);
    await outcome(() => joinTrainerAction({}, form({ code: CODE })));

    expect(await outcome(() => joinTrainerAction({}, form({ code: CODE })))).toEqual({ redirect: "/trainers" });
    expect(await studentsOf(ana)).toEqual([bruno]);
  });

  it("rejects the trainer's own link", async () => {
    signIn(ana);

    expect(await joinTrainerAction({}, form({ code: CODE }))).toEqual({ error: "This is your own invite link." });
    expect(await studentsOf(ana)).toEqual([]);
  });

  it("rejects a revoked trainer's link", async () => {
    await state.coaching.saveInviteCode(rita, "fedcba9876543210fedcba9876543210");
    signIn(bruno);

    expect(await joinTrainerAction({}, form({ code: "fedcba9876543210fedcba9876543210" }))).toEqual({
      error: "This trainer is not accepting students right now.",
    });
    expect(await state.coaching.listTrainers(bruno)).toEqual([]);
  });

  it.each(["", "nope", CODE.toUpperCase()])("rejects the unknown code %j", async (code) => {
    signIn(bruno);

    expect(await joinTrainerAction({}, form({ code }))).toEqual({ error: "This invite link is not valid." });
    expect(await state.coaching.listTrainers(bruno)).toEqual([]);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    expect(await outcome(() => joinTrainerAction({}, form({ code: CODE })))).toEqual({ redirect: "/login" });
    expect(await studentsOf(ana)).toEqual([]);
  });
});

describe("leaveTrainerAction", () => {
  beforeEach(async () => {
    await state.coaching.link(ana, bruno);
    await state.coaching.link(ana, carla);
  });

  it("removes only the session user's link to that trainer", async () => {
    signIn(bruno);

    // A forged student id in the form is ignored.
    await leaveTrainerAction(form({ trainerId: String(ana), studentId: String(carla) }));

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await studentsOf(ana)).toEqual([carla]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores an invalid trainer id", async () => {
    signIn(bruno);

    await leaveTrainerAction(form({ trainerId: "1e3" }));

    expect(await studentsOf(ana)).toEqual([carla, bruno]);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    expect(await outcome(() => leaveTrainerAction(form({ trainerId: String(ana) })))).toEqual({ redirect: "/login" });
    expect(await studentsOf(ana)).toEqual([carla, bruno]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("removeStudentAction", () => {
  beforeEach(async () => {
    await state.coaching.link(ana, bruno);
    await state.coaching.link(rita, bruno);
  });

  it("lets the session trainer remove their own student", async () => {
    signIn(ana);

    // A forged trainer id in the form is ignored.
    await removeStudentAction(form({ studentId: String(bruno), trainerId: String(rita) }));

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await studentsOf(ana)).toEqual([]);
    expect(await studentsOf(rita)).toEqual([bruno]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a revoked trainer", async () => {
    signIn(rita);

    await removeStudentAction(form({ studentId: String(bruno) }));

    expect(await studentsOf(rita)).toEqual([bruno]);
  });

  it("does nothing for a user who is not that student's trainer", async () => {
    signIn(carla);

    await removeStudentAction(form({ studentId: String(bruno), trainerId: String(ana) }));

    expect(await studentsOf(ana)).toEqual([bruno]);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    expect(await outcome(() => removeStudentAction(form({ studentId: String(bruno) })))).toEqual({
      redirect: "/login",
    });
    expect(await studentsOf(ana)).toEqual([bruno]);
  });
});

describe("regenerateInviteCodeAction", () => {
  it("replaces the session trainer's code", async () => {
    signIn(ana);

    await regenerateInviteCodeAction();

    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(await state.coaching.findInviteCode(ana)).toBe("fedcba9876543210fedcba9876543210");
    expect(await state.coaching.findTrainerByInviteCode(CODE)).toBeNull();
    expect(await state.coaching.findInviteCode(rita)).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a plain user", () => bruno],
    ["a revoked trainer", () => rita],
  ])("does nothing for %s", async (_name, who) => {
    signIn(who());

    await regenerateInviteCodeAction();

    expect(await state.coaching.findInviteCode(who())).toBeNull();
    expect(await state.coaching.findInviteCode(ana)).toBe(CODE);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    expect(await outcome(() => regenerateInviteCodeAction())).toEqual({ redirect: "/login" });
    expect(await state.coaching.findInviteCode(ana)).toBe(CODE);
  });
});
