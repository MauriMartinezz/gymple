import { describe, expect, it } from "vitest";
import { parseExerciseId } from "./parse-exercise-id";

describe("parseExerciseId", () => {
  it.each([
    ["42", 42],
    [" 7 ", 7],
    [3, 3],
  ])("accepts %j", (input, expected) => {
    expect(parseExerciseId(input)).toBe(expected);
  });

  it.each([["0"], ["-1"], ["1.5"], ["1e3"], ["0x10"], ["abc"], [""], [null], [undefined], [true], [0], [-2], [2.5], [Number.MAX_SAFE_INTEGER + 1]])(
    "rejects %j",
    (input) => {
      expect(parseExerciseId(input)).toBeNull();
    },
  );
});
