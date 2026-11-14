import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_IMPORT_FAILED,
  type GuestImportWriteResult,
  type GuestImportWriter,
} from "../application/import-guest-data";
import type { GuestImportPlan } from "../domain/guest-import-plan";

/*
 * The import action is a trust boundary (S14): the user comes only from the
 * session, a signed-out request writes nothing, and an unexpected failure is
 * reported without leaking details.
 */

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

class RecordingWriter implements GuestImportWriter {
  calls: Array<{ userId: number; plan: GuestImportPlan }> = [];
  failure: Error | null = null;

  async write(userId: number, plan: GuestImportPlan): Promise<GuestImportWriteResult> {
    if (this.failure) throw this.failure;
    this.calls.push({ userId, plan });
    return {
      counts: { exercises: plan.exercises.length, matchedExercises: 0, routines: 0, workouts: 0, sets: 0 },
      activeWorkoutSkipped: false,
    };
  }
}

const state = vi.hoisted(() => ({
  writer: null as unknown as RecordingWriter,
  currentUser: null as null | { id: number; email: string; name: string },
}));
const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./guest-import-service", () => ({
  get guestImportWriter() {
    return state.writer;
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const { importGuestDataAction } = await import("./actions");

const ALICE = { id: 7, email: "alice@test.dev", name: "Alice" };

const payload = JSON.stringify({
  version: 1,
  exercises: [{ id: 5, userId: 2, name: "Squat", muscleGroup: "legs", notes: null, archivedAt: null }],
  routines: [],
  sessions: [],
});

beforeEach(() => {
  state.writer = new RecordingWriter();
  state.currentUser = ALICE;
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe("importGuestDataAction", () => {
  it("imports for the signed-in user only, whatever user id the payload carries", async () => {
    const result = await importGuestDataAction(payload);

    expect(result).toMatchObject({ ok: true, imported: { exercises: 1 } });
    expect(state.writer.calls.map((c) => c.userId)).toEqual([ALICE.id]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("writes nothing without a session", async () => {
    state.currentUser = null;

    await expect(importGuestDataAction(payload)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(state.writer.calls).toEqual([]);
  });

  it("reports an unexpected failure as nothing imported", async () => {
    state.writer.failure = new Error("connection lost");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await importGuestDataAction(payload)).toEqual({ ok: false, message: GUEST_IMPORT_FAILED });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the use case's refusal for unreadable input without refreshing", async () => {
    expect(await importGuestDataAction({ version: 1 })).toMatchObject({ ok: false });
    expect(state.writer.calls).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});
