import { describe, expect, it } from "vitest";
import { SESSION_NOTES_MAX, validateSessionNotes, validateSetInput, type RawSetInput } from "./session";

const valid: RawSetInput = { weightKg: "80.5", reps: "8", rpe: "7.5", restSeconds: "90" };

const WEIGHT_ERROR = "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.";
const REPS_ERROR = "Reps must be a whole number from 1 to 100.";
const RPE_ERROR = "RPE must be a number from 1 to 10 in steps of 0.5.";
const REST_ERROR = "Rest must be a whole number of seconds from 0 to 600.";

describe("validateSetInput", () => {
  it("accepts a valid set and parses its numbers", () => {
    expect(validateSetInput(valid)).toEqual({
      ok: true,
      value: { weightKg: 80.5, reps: 8, rpe: 7.5, restSeconds: 90 },
    });
  });

  it("trims the values", () => {
    expect(validateSetInput({ weightKg: " 100 ", reps: " 5 ", rpe: " 9 ", restSeconds: " 0 " })).toEqual({
      ok: true,
      value: { weightKg: 100, reps: 5, rpe: 9, restSeconds: 0 },
    });
  });

  it("stores empty or missing optional fields as null", () => {
    const expected = { ok: true, value: { weightKg: 60, reps: 10, rpe: null, restSeconds: null } };
    expect(validateSetInput({ weightKg: "60", reps: "10", rpe: "", restSeconds: "  " })).toEqual(expected);
    expect(validateSetInput({ weightKg: "60", reps: "10" })).toEqual(expected);
    expect(validateSetInput({ weightKg: "60", reps: "10", rpe: null, restSeconds: null })).toEqual(expected);
  });

  it("accepts plain numbers as well as strings", () => {
    expect(validateSetInput({ weightKg: 42.25, reps: 12, rpe: 8, restSeconds: 60 })).toEqual({
      ok: true,
      value: { weightKg: 42.25, reps: 12, rpe: 8, restSeconds: 60 },
    });
  });

  describe("weight", () => {
    it.each(["0", "0.5", "999.99", "80.25", "80.1", "7"])("accepts %j", (weightKg) => {
      expect(validateSetInput({ ...valid, weightKg })).toMatchObject({ ok: true, value: { weightKg: Number(weightKg) } });
    });

    it.each(["", "  ", "abc", "1e3", "-1", "-0.5", "80.123", "1000", "999.991", "80,5", ".5", "80.", "+5", "Infinity", "0x10"])(
      "rejects %j",
      (weightKg) => {
        expect(validateSetInput({ ...valid, weightKg })).toEqual({ ok: false, errors: { weightKg: WEIGHT_ERROR } });
      },
    );

    it.each([undefined, null, -1, 1000, 80.123, Number.NaN, Number.POSITIVE_INFINITY, true, {}])(
      "rejects the raw value %j",
      (weightKg) => {
        expect(validateSetInput({ ...valid, weightKg })).toEqual({ ok: false, errors: { weightKg: WEIGHT_ERROR } });
      },
    );
  });

  describe("reps", () => {
    it.each(["1", "100", "12"])("accepts %j", (reps) => {
      expect(validateSetInput({ ...valid, reps })).toMatchObject({ ok: true, value: { reps: Number(reps) } });
    });

    it.each(["", "0", "101", "2.5", "1e1", "-3", "abc", undefined, 7.5])("rejects %j", (reps) => {
      expect(validateSetInput({ ...valid, reps })).toEqual({ ok: false, errors: { reps: REPS_ERROR } });
    });
  });

  describe("RPE", () => {
    it.each(["1", "1.5", "7", "7.0", "9.5", "10"])("accepts %j", (rpe) => {
      expect(validateSetInput({ ...valid, rpe })).toMatchObject({ ok: true, value: { rpe: Number(rpe) } });
    });

    it.each(["0", "0.5", "10.5", "11", "7.25", "7.3", "abc", "1e1", "-5"])("rejects %j", (rpe) => {
      expect(validateSetInput({ ...valid, rpe })).toEqual({ ok: false, errors: { rpe: RPE_ERROR } });
    });
  });

  describe("rest", () => {
    it.each(["0", "600", "90"])("accepts %j", (restSeconds) => {
      expect(validateSetInput({ ...valid, restSeconds })).toMatchObject({
        ok: true,
        value: { restSeconds: Number(restSeconds) },
      });
    });

    it.each(["601", "-1", "1.5", "1e2", "abc"])("rejects %j", (restSeconds) => {
      expect(validateSetInput({ ...valid, restSeconds })).toEqual({ ok: false, errors: { restSeconds: REST_ERROR } });
    });
  });

  it("reports every invalid field at once", () => {
    expect(validateSetInput({ weightKg: "abc", reps: "0", rpe: "11", restSeconds: "999" })).toEqual({
      ok: false,
      errors: { weightKg: WEIGHT_ERROR, reps: REPS_ERROR, rpe: RPE_ERROR, restSeconds: REST_ERROR },
    });
  });
});

describe("validateSessionNotes", () => {
  it("trims the notes", () => {
    expect(validateSessionNotes("  Felt strong  ")).toEqual({ ok: true, value: "Felt strong" });
  });

  it("stores empty or missing notes as null", () => {
    expect(validateSessionNotes("   ")).toEqual({ ok: true, value: null });
    expect(validateSessionNotes(undefined)).toEqual({ ok: true, value: null });
    expect(validateSessionNotes(null)).toEqual({ ok: true, value: null });
  });

  it(`accepts up to ${SESSION_NOTES_MAX} characters, counting a CRLF line break as one`, () => {
    const notes = `${"a".repeat(SESSION_NOTES_MAX - 2)}\r\nb`;

    expect(validateSessionNotes(notes)).toEqual({ ok: true, value: `${"a".repeat(SESSION_NOTES_MAX - 2)}\nb` });
  });

  it("rejects longer notes", () => {
    expect(validateSessionNotes("a".repeat(SESSION_NOTES_MAX + 1))).toEqual({
      ok: false,
      error: `Notes must be at most ${SESSION_NOTES_MAX} characters.`,
    });
  });
});
