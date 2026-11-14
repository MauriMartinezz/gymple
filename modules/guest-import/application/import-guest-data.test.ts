import { describe, expect, it } from "vitest";
import type { GuestImportPlan } from "../domain/guest-import-plan";
import {
  GUEST_IMPORT_MAX_BYTES,
  importGuestData,
  type GuestImportWriteResult,
  type GuestImportWriter,
} from "./import-guest-data";

class RecordingWriter implements GuestImportWriter {
  calls: Array<{ userId: number; plan: GuestImportPlan }> = [];
  constructor(private readonly outcome: Partial<GuestImportWriteResult> = {}) {}

  async write(userId: number, plan: GuestImportPlan): Promise<GuestImportWriteResult> {
    this.calls.push({ userId, plan });
    return {
      counts: {
        exercises: plan.exercises.length,
        matchedExercises: 0,
        routines: plan.routines.length,
        workouts: plan.workouts.length,
        sets: plan.workouts.reduce((n, w) => n + w.sets.length, 0),
      },
      activeWorkoutSkipped: false,
      ...this.outcome,
    };
  }
}

const payload = (exercises: unknown[]) =>
  JSON.stringify({ version: 1, exercises, routines: [], sessions: [] });

const squat = { id: 1, userId: 99, name: "Squat", muscleGroup: "legs", notes: null, archivedAt: null };

describe("importGuestData", () => {
  it("writes the valid records for the given user and reports what was skipped", async () => {
    const writer = new RecordingWriter();

    const result = await importGuestData(writer, 7, payload([squat, { ...squat, id: 2, name: "" }]));

    expect(writer.calls.map((c) => c.userId)).toEqual([7]);
    expect(result).toEqual({
      ok: true,
      imported: { exercises: 1, matchedExercises: 0, routines: 0, workouts: 0, sets: 0 },
      skipped: ["An exercise: Name is required."],
    });
  });

  it(`rejects a payload over ${GUEST_IMPORT_MAX_BYTES} bytes and imports nothing`, async () => {
    const writer = new RecordingWriter();
    const big = payload([{ ...squat, notes: "é".repeat(GUEST_IMPORT_MAX_BYTES / 2) }]);

    const result = await importGuestData(writer, 7, big);

    expect(result).toEqual({ ok: false, message: "The guest data is too large to import (over 512 KB). Nothing was imported." });
    expect(writer.calls).toEqual([]);
  });

  it("accepts a payload right at the limit", async () => {
    const writer = new RecordingWriter();
    const base = payload([{ ...squat, notes: "" }]);
    const exact = base.replace('"notes":""', `"notes":"${" ".repeat(GUEST_IMPORT_MAX_BYTES - base.length)}"`);
    expect(new TextEncoder().encode(exact).length).toBe(GUEST_IMPORT_MAX_BYTES);

    expect((await importGuestData(writer, 7, exact)).ok).toBe(true);
  });

  it("reports unreadable data instead of throwing, and imports nothing", async () => {
    const writer = new RecordingWriter();
    for (const bad of ["{not json", "null", '{"version":3}', 42, null, { version: 1 }]) {
      expect(await importGuestData(writer, 7, bad)).toEqual({
        ok: false,
        message: expect.stringMatching(/could not be read, so nothing was imported/),
      });
    }
    expect(writer.calls).toEqual([]);
  });

  it("reports the workout in progress when the account already has one", async () => {
    const writer = new RecordingWriter({ activeWorkoutSkipped: true });

    const result = await importGuestData(writer, 7, payload([squat]));

    expect(result).toMatchObject({
      ok: true,
      skipped: ["Workout in progress: not imported because your account already has one in progress."],
    });
  });
});
