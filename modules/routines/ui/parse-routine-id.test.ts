import { describe, expect, it } from "vitest";
import { parseRoutineId } from "./parse-routine-id";

describe("parseRoutineId", () => {
  it.each([
    ["7", 7],
    [" 12 ", 12],
    [3, 3],
  ])("accepts %j", (value, expected) => {
    expect(parseRoutineId(value)).toBe(expected);
  });

  it.each(["0", "-1", "1e3", "2.5", "", "abc", 0, -4, 1.5, Number.NaN, null, undefined, "99999999999999999999"])(
    "rejects %j",
    (value) => {
      expect(parseRoutineId(value)).toBeNull();
    },
  );
});
