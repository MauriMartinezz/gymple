import { describe, expect, it } from "vitest";
import { COMMENT_MAX, SUGGESTION_NOTE_MAX, validateComment, validateSuggestionInput } from "./feedback";

describe("validateSuggestionInput", () => {
  it("accepts weight and reps with optional sets and note", () => {
    expect(validateSuggestionInput({ weightKg: "85", reps: "6", sets: "", note: "  " })).toEqual({
      ok: true,
      value: { weightKg: 85, reps: 6, sets: null, note: null },
    });
    expect(validateSuggestionInput({ weightKg: "82.25", reps: "10", sets: "4", note: "  Slow eccentric " })).toEqual({
      ok: true,
      value: { weightKg: 82.25, reps: 10, sets: 4, note: "Slow eccentric" },
    });
  });

  it("uses the same weight and reps rules as a logged set", () => {
    for (const weightKg of ["0", "999.99"]) {
      expect(validateSuggestionInput({ weightKg, reps: "1" }).ok).toBe(true);
    }
    expect(validateSuggestionInput({ weightKg: "1", reps: "100" }).ok).toBe(true);

    const bad = validateSuggestionInput({ weightKg: "80.125", reps: "0" });
    expect(bad).toEqual({
      ok: false,
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        reps: "Reps must be a whole number from 1 to 100.",
      },
    });
    for (const weightKg of ["-1", "1000", "1e2", "", "80,5"]) {
      expect(validateSuggestionInput({ weightKg, reps: "5" }).ok).toBe(false);
    }
    for (const reps of ["101", "2.5", "", "abc"]) {
      expect(validateSuggestionInput({ weightKg: "50", reps }).ok).toBe(false);
    }
  });

  it("takes sets as a whole number from 1 to 20 when given", () => {
    expect(validateSuggestionInput({ weightKg: "50", reps: "5", sets: "1" }).ok).toBe(true);
    expect(validateSuggestionInput({ weightKg: "50", reps: "5", sets: "20" }).ok).toBe(true);
    for (const sets of ["0", "21", "2.5", "x"]) {
      expect(validateSuggestionInput({ weightKg: "50", reps: "5", sets })).toEqual({
        ok: false,
        errors: { sets: "Sets must be a whole number from 1 to 20." },
      });
    }
  });

  it("limits the note to 500 characters, counting CRLF as one", () => {
    const exact = "a".repeat(SUGGESTION_NOTE_MAX);
    expect(validateSuggestionInput({ weightKg: "50", reps: "5", note: exact }).ok).toBe(true);
    expect(validateSuggestionInput({ weightKg: "50", reps: "5", note: `${exact}b` })).toEqual({
      ok: false,
      errors: { note: "Note must be at most 500 characters." },
    });
    const withBreaks = `${"a".repeat(249)}\r\n${"b".repeat(250)}`;
    expect(validateSuggestionInput({ weightKg: "50", reps: "5", note: withBreaks })).toEqual({
      ok: true,
      value: { weightKg: 50, reps: 5, sets: null, note: `${"a".repeat(249)}\n${"b".repeat(250)}` },
    });
  });
});

describe("validateComment", () => {
  it("trims the comment and requires 1 to 1000 characters", () => {
    expect(validateComment("  Great depth today  ")).toEqual({ ok: true, value: "Great depth today" });
    expect(validateComment("x")).toEqual({ ok: true, value: "x" });
    expect(validateComment("a".repeat(COMMENT_MAX))).toEqual({ ok: true, value: "a".repeat(COMMENT_MAX) });

    for (const raw of ["", "   ", "\r\n", null, undefined, 42]) {
      expect(validateComment(raw)).toEqual({ ok: false, error: "Write a comment." });
    }
    expect(validateComment("a".repeat(COMMENT_MAX + 1))).toEqual({
      ok: false,
      error: "Comments must be at most 1000 characters.",
    });
  });

  it("counts a CRLF line break as one character, like session notes", () => {
    const text = `${"a".repeat(499)}\r\n${"b".repeat(500)}`;
    expect(validateComment(text)).toEqual({ ok: true, value: `${"a".repeat(499)}\n${"b".repeat(500)}` });
    expect(validateComment(`${text}c`).ok).toBe(false);
  });
});
