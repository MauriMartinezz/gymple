import { describe, expect, it } from "vitest";
import { EXERCISE_NAME_MAX, EXERCISE_NOTES_MAX, validateExerciseInput } from "./exercise";

describe("validateExerciseInput", () => {
  it("accepts a valid exercise and normalizes it", () => {
    expect(
      validateExerciseInput({ name: "  Bench   press ", muscleGroup: "chest", notes: "  Flat bench " }),
    ).toEqual({
      ok: true,
      value: { name: "Bench press", muscleGroup: "chest", notes: "Flat bench" },
    });
  });

  it("stores empty or missing notes as null", () => {
    expect(validateExerciseInput({ name: "Squat", muscleGroup: "legs", notes: "   " })).toEqual({
      ok: true,
      value: { name: "Squat", muscleGroup: "legs", notes: null },
    });
    expect(validateExerciseInput({ name: "Squat", muscleGroup: "legs" })).toMatchObject({
      ok: true,
      value: { notes: null },
    });
  });

  it("requires a name", () => {
    expect(validateExerciseInput({ name: "   ", muscleGroup: "chest" })).toEqual({
      ok: false,
      errors: { name: "Name is required." },
    });
  });

  it("limits the name length", () => {
    const result = validateExerciseInput({ name: "a".repeat(EXERCISE_NAME_MAX + 1), muscleGroup: "chest" });
    expect(result).toEqual({
      ok: false,
      errors: { name: `Name must be at most ${EXERCISE_NAME_MAX} characters.` },
    });
  });

  it("rejects an unknown muscle group", () => {
    expect(validateExerciseInput({ name: "Curl", muscleGroup: "forearms" })).toEqual({
      ok: false,
      errors: { muscleGroup: "Choose a muscle group." },
    });
  });

  it("limits the notes length", () => {
    const result = validateExerciseInput({
      name: "Curl",
      muscleGroup: "biceps",
      notes: "a".repeat(EXERCISE_NOTES_MAX + 1),
    });
    expect(result).toEqual({
      ok: false,
      errors: { notes: `Notes must be at most ${EXERCISE_NOTES_MAX} characters.` },
    });
  });

  it("counts a CRLF line break (as browsers submit them) as one character", () => {
    const line = "a".repeat(99);
    const notes = Array(10).fill(line).join("\r\n"); // 990 chars + 9 line breaks = 999

    expect(validateExerciseInput({ name: "Curl", muscleGroup: "biceps", notes })).toEqual({
      ok: true,
      value: { name: "Curl", muscleGroup: "biceps", notes: Array(10).fill(line).join("\n") },
    });
  });

  it("reports every invalid field at once", () => {
    const result = validateExerciseInput({ name: "", muscleGroup: "" });
    expect(result).toEqual({
      ok: false,
      errors: { name: "Name is required.", muscleGroup: "Choose a muscle group." },
    });
  });
});
