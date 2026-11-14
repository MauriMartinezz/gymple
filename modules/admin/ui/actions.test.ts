import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { RecordingAccountEmails } from "@/modules/trainers/testing/recording-account-emails";

/*
 * Admin actions are a trust boundary. These tests pin that every action
 * checks the admin flag through requireAdmin() (which reads it from the
 * database), and that a signed-out user or a non-admin changes nothing.
 */

const ADMIN = { id: 100, email: "admin@test.dev", name: "Admin" };
const PLAIN = { id: 101, email: "plain@test.dev", name: "Plain" };

/** Mirrors Next: redirect() and notFound() throw, so nothing after them runs. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_HTTP_ERROR_FALLBACK;404");
  }
}

const state = vi.hoisted(() => ({
  trainers: null as unknown as InMemoryTrainerRepository,
  emails: null as unknown as RecordingAccountEmails,
  currentUser: null as null | { id: number; email: string; name: string },
  admins: new Set<number>(),
}));

const requireAdmin = vi.hoisted(() => vi.fn());
// Present so that an action using requireUser() instead would pass for a non-admin, and fail these tests.
const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireAdmin, requireUser }));
vi.mock("./admin-service", () => ({
  get trainerAdmin() {
    return { trainers: state.trainers, emails: state.emails };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new NotFoundSignal();
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const {
  certifyTrainerAction,
  createTrainerAction,
  restoreTrainerAction,
  revokeTrainerAction,
  updateTrainerAction,
} = await import("./actions");

const emptyTrainerState = { errors: {}, values: { name: "", email: "", dni: "" } };
const emptyCertifyState = { errors: {}, values: { email: "", dni: "" } };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Runs an action and returns how it ended: a redirect URL, "not_found", or its result. */
async function outcome<T>(run: () => Promise<T>): Promise<{ redirect: string } | "not_found" | { result: T }> {
  try {
    return { result: await run() };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    if (error instanceof NotFoundSignal) return "not_found";
    throw error;
  }
}

async function seedTrainer(email = "ana@example.com", dni = "12345678") {
  return state.trainers.createAccountWithTrainer({ name: "Ana", email, dni });
}

beforeEach(() => {
  state.trainers = new InMemoryTrainerRepository();
  state.emails = new RecordingAccountEmails();
  state.currentUser = ADMIN;
  state.admins = new Set([ADMIN.id]);
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
  requireAdmin.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    if (!state.admins.has(state.currentUser.id)) throw new NotFoundSignal();
    return state.currentUser;
  });
});

/** Every action, with what it would change, run against the two rejected callers. */
const signedOut = { name: "a signed-out user", user: null, expected: { redirect: "/login" } } as const;
const nonAdmin = { name: "a non-admin", user: PLAIN, expected: "not_found" } as const;

describe("createTrainerAction", () => {
  it("creates the trainer, sends the set-password email and redirects to the list", async () => {
    const result = await outcome(() =>
      createTrainerAction(emptyTrainerState, form({ name: "Ana", email: "ana@example.com", dni: "12.345.678" })),
    );

    expect(result).toEqual({ redirect: "/admin" });
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(await state.trainers.list()).toEqual([
      expect.objectContaining({ email: "ana@example.com", dni: "12345678", emailVerified: true }),
    ]);
    expect(state.emails.sent).toEqual([{ kind: "set_password", to: "ana@example.com" }]);
  });

  it("points to certifying when the email already has an account", async () => {
    state.trainers.addAccount({ name: "Existing", email: "ana@example.com" });

    const result = await createTrainerAction(
      emptyTrainerState,
      form({ name: "Ana", email: "ana@example.com", dni: "12345678" }),
    );

    expect(result).toEqual({
      errors: { form: "An account already uses this email. Certify it as a trainer instead." },
      values: { name: "Ana", email: "ana@example.com", dni: "12345678" },
      certifyEmail: "ana@example.com",
    });
    expect(await state.trainers.list()).toEqual([]);
  });

  it("returns field errors and the submitted values for invalid input", async () => {
    const result = await createTrainerAction(emptyTrainerState, form({ name: "Ana", email: "x", dni: "1" }));

    expect(result).toEqual({
      errors: { email: "Enter a valid email address.", dni: "DNI must be 7 or 8 digits." },
      values: { name: "Ana", email: "x", dni: "1" },
    });
  });

  it.each([signedOut, nonAdmin])("rejects $name and changes nothing", async ({ user, expected }) => {
    state.currentUser = user;

    const result = await outcome(() =>
      createTrainerAction(emptyTrainerState, form({ name: "Ana", email: "ana@example.com", dni: "12345678" })),
    );

    expect(result).toEqual(expected);
    expect(await state.trainers.findAccountByEmail("ana@example.com")).toBeNull();
    expect(state.emails.sent).toEqual([]);
  });
});

describe("certifyTrainerAction", () => {
  it("certifies an existing account and redirects to the list", async () => {
    const id = state.trainers.addAccount({ name: "Carla", email: "carla@example.com", emailVerified: true });

    const result = await outcome(() =>
      certifyTrainerAction(emptyCertifyState, form({ email: "carla@example.com", dni: "7654321" })),
    );

    expect(result).toEqual({ redirect: "/admin" });
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(await state.trainers.isActiveTrainer(id)).toBe(true);
  });

  it("returns errors for an email without an account", async () => {
    const result = await certifyTrainerAction(emptyCertifyState, form({ email: "nobody@example.com", dni: "7654321" }));

    expect(result).toEqual({
      errors: { email: "No account uses this email." },
      values: { email: "nobody@example.com", dni: "7654321" },
    });
  });

  it.each([signedOut, nonAdmin])("rejects $name and changes nothing", async ({ user, expected }) => {
    const id = state.trainers.addAccount({ name: "Carla", email: "carla@example.com" });
    state.currentUser = user;

    const result = await outcome(() =>
      certifyTrainerAction(emptyCertifyState, form({ email: "carla@example.com", dni: "7654321" })),
    );

    expect(result).toEqual(expected);
    expect(await state.trainers.findByUserId(id)).toBeNull();
  });

  it("does not let a non-admin certify themselves", async () => {
    const self = state.trainers.addAccount({ name: "Plain", email: PLAIN.email });
    state.currentUser = { ...PLAIN, id: self };

    expect(await outcome(() => certifyTrainerAction(emptyCertifyState, form({ email: PLAIN.email, dni: "7654321" })))).toBe(
      "not_found",
    );
    expect(await state.trainers.isActiveTrainer(self)).toBe(false);
  });
});

describe("updateTrainerAction", () => {
  it("edits the trainer and redirects to the list", async () => {
    const trainer = await seedTrainer();

    const result = await outcome(() =>
      updateTrainerAction(trainer.userId, emptyTrainerState, form({ name: "Ana B", email: "ana@example.com", dni: "1111111" })),
    );

    expect(result).toEqual({ redirect: "/admin" });
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(await state.trainers.findByUserId(trainer.userId)).toMatchObject({ name: "Ana B", dni: "1111111" });
    expect(state.emails.sent).toEqual([]);
  });

  it("sends the verification email to a new address", async () => {
    const trainer = await seedTrainer();

    await outcome(() =>
      updateTrainerAction(trainer.userId, emptyTrainerState, form({ name: "Ana", email: "new@example.com", dni: "12345678" })),
    );

    expect(await state.trainers.findByUserId(trainer.userId)).toMatchObject({ email: "new@example.com", emailVerified: false });
    expect(state.emails.sent).toEqual([{ kind: "verify_email", to: "new@example.com" }]);
  });

  it.each([0, -1, Number.NaN, 999_999])("treats the bound id %s as missing", async (id) => {
    const result = await updateTrainerAction(id, emptyTrainerState, form({ name: "X", email: "x@example.com", dni: "1234567" }));

    expect(result.errors).toEqual({ form: "This trainer no longer exists." });
  });

  it("treats a plain account as missing and leaves it unchanged", async () => {
    const id = state.trainers.addAccount({ name: "Carla", email: "carla@example.com" });

    const result = await updateTrainerAction(id, emptyTrainerState, form({ name: "Hacked", email: "carla@example.com", dni: "1234567" }));

    expect(result.errors).toEqual({ form: "This trainer no longer exists." });
    expect(await state.trainers.findAccountByEmail("carla@example.com")).toMatchObject({ name: "Carla" });
  });

  it.each([signedOut, nonAdmin])("rejects $name and changes nothing", async ({ user, expected }) => {
    const trainer = await seedTrainer();
    state.currentUser = user;

    const result = await outcome(() =>
      updateTrainerAction(trainer.userId, emptyTrainerState, form({ name: "Hacked", email: "evil@example.com", dni: "1111111" })),
    );

    expect(result).toEqual(expected);
    expect(await state.trainers.findByUserId(trainer.userId)).toEqual(trainer);
    expect(state.emails.sent).toEqual([]);
  });
});

describe.each([
  { name: "revokeTrainerAction", action: () => revokeTrainerAction, revokes: true },
  { name: "restoreTrainerAction", action: () => restoreTrainerAction, revokes: false },
])("$name", ({ action, revokes }) => {
  /** A trainer in the state this action changes from. */
  async function seedFor() {
    const trainer = await seedTrainer();
    if (!revokes) await state.trainers.setRevoked(trainer.userId, true);
    return trainer;
  }

  const isActive = (userId: number) => state.trainers.isActiveTrainer(userId);

  it("changes the trainer's status and refreshes the page", async () => {
    const trainer = await seedFor();

    await action()(form({ userId: String(trainer.userId) }));

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(await isActive(trainer.userId)).toBe(!revokes);
    expect(await state.trainers.findByUserId(trainer.userId)).toMatchObject({ dni: "12345678", name: "Ana" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores an invalid id", async () => {
    const trainer = await seedFor();

    await action()(form({ userId: "1e3" }));

    expect(await isActive(trainer.userId)).toBe(revokes);
  });

  it.each([signedOut, nonAdmin])("rejects $name and changes nothing", async ({ user, expected }) => {
    const trainer = await seedFor();
    state.currentUser = user;

    const result = await outcome(() => action()(form({ userId: String(trainer.userId) })));

    expect(result).toEqual(expected);
    expect(await isActive(trainer.userId)).toBe(revokes);
    expect(refresh).not.toHaveBeenCalled();
  });
});
