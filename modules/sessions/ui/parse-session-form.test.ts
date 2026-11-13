import { describe, expect, it } from "vitest";
import { parseSessionId, readSetForm } from "./parse-session-form";

describe("parseSessionId", () => {
  it.each([
    ["7", 7],
    [" 12 ", 12],
    [3, 3],
  ])("accepts the positive integer %j", (value, expected) => {
    expect(parseSessionId(value)).toBe(expected);
  });

  it.each([null, undefined, "", "0", "-1", "1.5", "1e3", "abc", 0, -2, 1.5, Number.NaN, "99999999999999999999"])(
    "treats %j as not found",
    (value) => {
      expect(parseSessionId(value)).toBeNull();
    },
  );
});

describe("readSetForm", () => {
  it("reads every set field as submitted text", () => {
    const data = new FormData();
    data.append("exerciseId", "10");
    data.append("weightKg", "82.5");
    data.append("reps", "8");
    data.append("rpe", "8.5");
    data.append("restSeconds", "90");

    expect(readSetForm(data)).toEqual({
      exerciseId: "10",
      weightKg: "82.5",
      reps: "8",
      rpe: "8.5",
      restSeconds: "90",
    });
  });

  it("reads missing or non-text fields as empty strings", () => {
    const data = new FormData();
    data.append("reps", new Blob(["8"]));

    expect(readSetForm(data)).toEqual({ exerciseId: "", weightKg: "", reps: "", rpe: "", restSeconds: "" });
  });
});
