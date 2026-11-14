import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryTrainerRepository } from "../testing/in-memory-trainer-repository";
import { RecordingAccountEmails } from "../testing/recording-account-emails";
import {
  certifyTrainer,
  createTrainer,
  listTrainers,
  restoreTrainer,
  revokeTrainer,
  updateTrainer,
  type TrainerAdminDeps,
} from "./trainer-admin-use-cases";

let trainers: InMemoryTrainerRepository;
let emails: RecordingAccountEmails;
let deps: TrainerAdminDeps;

const ana = { name: "Ana", email: "ana@example.com", dni: "12.345.678" };

beforeEach(() => {
  trainers = new InMemoryTrainerRepository();
  emails = new RecordingAccountEmails();
  deps = { trainers, emails };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTrainer", () => {
  it("creates a verified trainer account and sends it a set-password email", async () => {
    const result = await createTrainer(deps, ana);

    expect(result).toMatchObject({
      ok: true,
      trainer: { name: "Ana", email: "ana@example.com", dni: "12345678", status: "active", emailVerified: true },
    });
    expect(emails.sent).toEqual([{ kind: "set_password", to: "ana@example.com" }]);
  });

  it("points to certifying when the email already has an account, ignoring case", async () => {
    const id = trainers.addAccount({ name: "Existing", email: "ana@example.com" });

    const result = await createTrainer(deps, { ...ana, email: " ANA@example.com " });

    expect(result).toEqual({ ok: false, reason: "account_exists", email: "ana@example.com" });
    expect(await trainers.findByUserId(id)).toBeNull();
    expect(await trainers.findAccountByEmail("ana@example.com")).toMatchObject({ name: "Existing" });
    expect(emails.sent).toEqual([]);
  });

  it("returns field errors and creates nothing for invalid input", async () => {
    const result = await createTrainer(deps, { name: "", email: "ana@example.com", dni: "12" });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { name: "Name is required.", dni: "DNI must be 7 or 8 digits." },
    });
    expect(await trainers.list()).toEqual([]);
    expect(emails.sent).toEqual([]);
  });

  it("rejects a DNI another trainer has", async () => {
    await createTrainer(deps, ana);
    emails.sent.length = 0;

    const result = await createTrainer(deps, { name: "Bruno", email: "bruno@example.com", dni: "12345678" });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { dni: "Another trainer already has this DNI." },
    });
    expect(await trainers.findAccountByEmail("bruno@example.com")).toBeNull();
    expect(emails.sent).toEqual([]);
  });

  it("keeps the trainer when the email cannot be sent, and logs the failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    emails.failWith = new Error("SMTP down");

    const result = await createTrainer(deps, ana);

    expect(result).toMatchObject({ ok: true });
    expect(await trainers.findAccountByEmail(ana.email)).not.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("certifyTrainer", () => {
  it("adds the trainer capability to an existing account without emailing it", async () => {
    const id = trainers.addAccount({ name: "Carla", email: "carla@example.com", emailVerified: true });

    const result = await certifyTrainer(deps, { email: "Carla@Example.com", dni: "7.654.321" });

    expect(result).toMatchObject({ ok: true, trainer: { userId: id, name: "Carla", dni: "7654321", status: "active" } });
    expect(emails.sent).toEqual([]);
  });

  it("reports an email without an account", async () => {
    const result = await certifyTrainer(deps, { email: "nobody@example.com", dni: "7654321" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { email: "No account uses this email." } });
    expect(await trainers.list()).toEqual([]);
  });

  it("reports an account that is already an active trainer", async () => {
    await createTrainer(deps, ana);

    const result = await certifyTrainer(deps, { email: ana.email, dni: "7654321" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { email: "This account is already a trainer." } });
    expect(await trainers.list()).toEqual([expect.objectContaining({ email: ana.email, dni: "12345678" })]);
  });

  it("points a revoked trainer to restoring", async () => {
    const created = await createTrainer(deps, ana);
    if (!created.ok) throw new Error("setup failed");
    await revokeTrainer(deps, created.trainer.userId);

    const result = await certifyTrainer(deps, { email: ana.email, dni: "7654321" });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      errors: { email: "This account is a revoked trainer. Restore it from the trainer list." },
    });
    expect(await trainers.findByUserId(created.trainer.userId)).toMatchObject({ status: "revoked", dni: "12345678" });
  });

  it("rejects a DNI another trainer has", async () => {
    await createTrainer(deps, ana);
    const id = trainers.addAccount({ name: "Carla", email: "carla@example.com" });

    const result = await certifyTrainer(deps, { email: "carla@example.com", dni: "12345678" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { dni: "Another trainer already has this DNI." } });
    expect(await trainers.isActiveTrainer(id)).toBe(false);
  });

  it("returns field errors for invalid input", async () => {
    expect(await certifyTrainer(deps, { email: "", dni: "" })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { email: "Enter a valid email address.", dni: "DNI is required." },
    });
  });
});

describe("revokeTrainer and restoreTrainer", () => {
  it("revokes only the capability and restores it with the stored DNI", async () => {
    const created = await createTrainer(deps, ana);
    if (!created.ok) throw new Error("setup failed");
    const { userId } = created.trainer;

    expect(await revokeTrainer(deps, userId)).toBe(true);
    expect(await trainers.isActiveTrainer(userId)).toBe(false);
    expect(await trainers.findAccountByEmail(ana.email)).toMatchObject({ userId, name: "Ana" });

    expect(await restoreTrainer(deps, userId)).toBe(true);
    expect(await trainers.findByUserId(userId)).toEqual(created.trainer);
  });

  it("returns false for an account that is not a trainer", async () => {
    const id = trainers.addAccount({ name: "Carla", email: "carla@example.com" });

    expect(await revokeTrainer(deps, id)).toBe(false);
    expect(await restoreTrainer(deps, id)).toBe(false);
  });
});

describe("updateTrainer", () => {
  async function seedTrainer() {
    const created = await createTrainer(deps, ana);
    if (!created.ok) throw new Error("setup failed");
    emails.sent.length = 0;
    return created.trainer;
  }

  it("edits name and DNI without any email when the email is unchanged", async () => {
    const trainer = await seedTrainer();

    const result = await updateTrainer(deps, trainer.userId, { name: "Ana María", email: "ANA@example.com", dni: "1.111.111" });

    expect(result).toMatchObject({ ok: true, trainer: { name: "Ana María", dni: "1111111", emailVerified: true } });
    expect(emails.sent).toEqual([]);
  });

  it("marks a new email unverified and sends the verification to the new address", async () => {
    const trainer = await seedTrainer();

    const result = await updateTrainer(deps, trainer.userId, { ...ana, email: "ana.new@example.com" });

    expect(result).toMatchObject({ ok: true, trainer: { email: "ana.new@example.com", emailVerified: false } });
    expect(emails.sent).toEqual([{ kind: "verify_email", to: "ana.new@example.com" }]);
  });

  it("rejects an email another account uses", async () => {
    const trainer = await seedTrainer();
    trainers.addAccount({ name: "Carla", email: "carla@example.com" });

    const result = await updateTrainer(deps, trainer.userId, { ...ana, email: "carla@example.com" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { email: "Another account already uses this email." } });
    expect(await trainers.findByUserId(trainer.userId)).toEqual(trainer);
    expect(emails.sent).toEqual([]);
  });

  it("rejects a DNI another trainer has", async () => {
    const trainer = await seedTrainer();
    await createTrainer(deps, { name: "Bruno", email: "bruno@example.com", dni: "2345678" });
    emails.sent.length = 0;

    const result = await updateTrainer(deps, trainer.userId, { ...ana, dni: "2345678" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: { dni: "Another trainer already has this DNI." } });
    expect(await trainers.findByUserId(trainer.userId)).toEqual(trainer);
  });

  it("treats an account that is not a trainer as missing", async () => {
    const id = trainers.addAccount({ name: "Carla", email: "carla@example.com" });

    expect(await updateTrainer(deps, id, ana)).toEqual({ ok: false, reason: "not_found" });
    expect(await trainers.findAccountByEmail("carla@example.com")).toMatchObject({ name: "Carla" });
  });

  it("returns field errors for invalid input", async () => {
    const trainer = await seedTrainer();

    expect(await updateTrainer(deps, trainer.userId, { name: "", email: "x", dni: "1" })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await trainers.findByUserId(trainer.userId)).toEqual(trainer);
  });
});

describe("listTrainers", () => {
  it("returns every trainer, newest first", async () => {
    await createTrainer(deps, ana);
    await createTrainer(deps, { name: "Bruno", email: "bruno@example.com", dni: "2345678" });

    expect((await listTrainers(deps)).map((t) => t.name)).toEqual(["Bruno", "Ana"]);
  });
});
