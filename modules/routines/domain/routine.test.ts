import { describe, expect, it } from "vitest";
import {
  ROUTINE_DESCRIPTION_MAX,
  ROUTINE_ITEM_NOTES_MAX,
  ROUTINE_ITEMS_MAX,
  ROUTINE_NAME_MAX,
  validateRoutineInput,
  type RawRoutineItemInput,
} from "./routine";

const item: RawRoutineItemInput = {
  exerciseId: "7",
  targetSets: "3",
  targetRepsMin: "8",
  targetRepsMax: "12",
  restSeconds: "90",
  notes: "",
};

const parsedItem = {
  exerciseId: 7,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
};

describe("validateRoutineInput", () => {
  it("accepts a valid routine and normalizes it", () => {
    expect(
      validateRoutineInput({
        name: "  Push   day ",
        description: "  Chest and triceps ",
        items: [item, { ...item, exerciseId: 9, targetSets: 4, notes: "  Slow eccentric " }],
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Push day",
        description: "Chest and triceps",
        items: [parsedItem, { ...parsedItem, exerciseId: 9, targetSets: 4, notes: "Slow eccentric" }],
      },
    });
  });

  it("keeps the item order and allows the same exercise twice", () => {
    const result = validateRoutineInput({
      name: "Legs",
      items: [{ ...item, exerciseId: "2" }, { ...item, exerciseId: "1" }, { ...item, exerciseId: "2" }],
    });

    expect(result.ok && result.value.items.map((i) => i.exerciseId)).toEqual([2, 1, 2]);
  });

  it("stores an empty or missing description as null", () => {
    expect(validateRoutineInput({ name: "Legs", description: "   ", items: [item] })).toMatchObject({
      ok: true,
      value: { description: null },
    });
    expect(validateRoutineInput({ name: "Legs", items: [item] })).toMatchObject({
      ok: true,
      value: { description: null },
    });
  });

  it("requires a name", () => {
    expect(validateRoutineInput({ name: "   ", items: [item] })).toEqual({
      ok: false,
      errors: { name: "Name is required." },
    });
  });

  it("limits the name length", () => {
    expect(validateRoutineInput({ name: "a".repeat(ROUTINE_NAME_MAX + 1), items: [item] })).toEqual({
      ok: false,
      errors: { name: `Name must be at most ${ROUTINE_NAME_MAX} characters.` },
    });
  });

  it("limits the description length, counting a CRLF line break as one character", () => {
    const line = "a".repeat(99);
    const description = Array(10).fill(line).join("\r\n"); // 999 chars once normalized

    expect(validateRoutineInput({ name: "Legs", description, items: [item] })).toMatchObject({
      ok: true,
      value: { description: Array(10).fill(line).join("\n") },
    });
    expect(
      validateRoutineInput({ name: "Legs", description: "a".repeat(ROUTINE_DESCRIPTION_MAX + 1), items: [item] }),
    ).toEqual({
      ok: false,
      errors: { description: `Description must be at most ${ROUTINE_DESCRIPTION_MAX} characters.` },
    });
  });

  it("requires at least one exercise", () => {
    const expected = { ok: false, errors: { items: "Add at least one exercise." } };
    expect(validateRoutineInput({ name: "Legs", items: [] })).toEqual(expected);
    expect(validateRoutineInput({ name: "Legs" })).toEqual(expected);
    expect(validateRoutineInput({ name: "Legs", items: "nope" })).toEqual(expected);
  });

  it("limits the number of exercises", () => {
    expect(
      validateRoutineInput({ name: "Legs", items: Array(ROUTINE_ITEMS_MAX + 1).fill(item) }),
    ).toEqual({
      ok: false,
      errors: { items: `A routine can have at most ${ROUTINE_ITEMS_MAX} exercises.` },
    });
    expect(validateRoutineInput({ name: "Legs", items: Array(ROUTINE_ITEMS_MAX).fill(item) }).ok).toBe(true);
  });

  it("requires an exercise on every item", () => {
    for (const exerciseId of [undefined, "", "0", "-1", "abc", 1.5]) {
      expect(validateRoutineInput({ name: "Legs", items: [{ ...item, exerciseId }] })).toEqual({
        ok: false,
        errors: { itemErrors: [{ exerciseId: "Choose an exercise." }] },
      });
    }
  });

  it("accepts the boundaries of every numeric target", () => {
    const low = { ...item, targetSets: "1", targetRepsMin: "1", targetRepsMax: "1", restSeconds: "0" };
    const high = { ...item, targetSets: 20, targetRepsMin: 100, targetRepsMax: 100, restSeconds: 600 };

    expect(validateRoutineInput({ name: "Legs", items: [low, high] })).toMatchObject({
      ok: true,
      value: {
        items: [
          { targetSets: 1, targetRepsMin: 1, targetRepsMax: 1, restSeconds: 0 },
          { targetSets: 20, targetRepsMin: 100, targetRepsMax: 100, restSeconds: 600 },
        ],
      },
    });
  });

  it("rejects targets that are out of range or not whole numbers", () => {
    const messages = {
      targetSets: "Sets must be a whole number from 1 to 20.",
      targetRepsMin: "Minimum reps must be a whole number from 1 to 100.",
      targetRepsMax: "Maximum reps must be a whole number from 1 to 100.",
      restSeconds: "Rest must be a whole number of seconds from 0 to 600.",
    } as const;
    const invalid = {
      targetSets: ["0", "21", "", "2.5", "1e1", "-3", " ", "3 sets", undefined],
      targetRepsMin: ["0", "101", "1e3", "2.5", ""],
      targetRepsMax: ["0", "101", "1e3", "12.0", ""],
      restSeconds: ["-1", "601", "1e2", "", "0x10"],
    } as const;

    for (const field of Object.keys(invalid) as Array<keyof typeof invalid>) {
      for (const value of invalid[field]) {
        const result = validateRoutineInput({ name: "Legs", items: [{ ...item, [field]: value }] });
        expect(result, `${field}=${JSON.stringify(value)}`).toEqual({
          ok: false,
          errors: { itemErrors: [{ [field]: messages[field] }] },
        });
      }
    }
  });

  it("trims whole numbers submitted with surrounding spaces", () => {
    expect(validateRoutineInput({ name: "Legs", items: [{ ...item, targetSets: " 4 " }] })).toMatchObject({
      ok: true,
      value: { items: [{ targetSets: 4 }] },
    });
  });

  it("requires the minimum reps to be at most the maximum", () => {
    expect(
      validateRoutineInput({ name: "Legs", items: [{ ...item, targetRepsMin: "12", targetRepsMax: "8" }] }),
    ).toEqual({
      ok: false,
      errors: { itemErrors: [{ targetRepsMax: "Maximum reps must be at least the minimum." }] },
    });
  });

  it("limits the item notes, counting a CRLF line break as one character", () => {
    const notes = "a".repeat(ROUTINE_ITEM_NOTES_MAX - 1) + "\r\n"; // trailing break is trimmed
    expect(validateRoutineInput({ name: "Legs", items: [{ ...item, notes: "a\r\nb" }] })).toMatchObject({
      ok: true,
      value: { items: [{ notes: "a\nb" }] },
    });
    expect(validateRoutineInput({ name: "Legs", items: [{ ...item, notes }] }).ok).toBe(true);
    expect(
      validateRoutineInput({ name: "Legs", items: [{ ...item, notes: "a".repeat(ROUTINE_ITEM_NOTES_MAX + 1) }] }),
    ).toEqual({
      ok: false,
      errors: { itemErrors: [{ notes: `Notes must be at most ${ROUTINE_ITEM_NOTES_MAX} characters.` }] },
    });
  });

  it("reports errors at the index of each invalid item only", () => {
    const result = validateRoutineInput({
      name: "Legs",
      items: [item, { ...item, targetSets: "0" }, item, { ...item, exerciseId: "" }],
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        itemErrors: [
          undefined,
          { targetSets: "Sets must be a whole number from 1 to 20." },
          undefined,
          { exerciseId: "Choose an exercise." },
        ],
      },
    });
    expect(!result.ok && result.errors.itemErrors).toHaveLength(4);
  });

  it("treats a non-object item as an item with every field missing", () => {
    expect(validateRoutineInput({ name: "Legs", items: [null] })).toEqual({
      ok: false,
      errors: {
        itemErrors: [
          {
            exerciseId: "Choose an exercise.",
            targetSets: "Sets must be a whole number from 1 to 20.",
            targetRepsMin: "Minimum reps must be a whole number from 1 to 100.",
            targetRepsMax: "Maximum reps must be a whole number from 1 to 100.",
            restSeconds: "Rest must be a whole number of seconds from 0 to 600.",
          },
        ],
      },
    });
  });

  it("reports every invalid field at once", () => {
    expect(validateRoutineInput({ name: "", description: "a".repeat(ROUTINE_DESCRIPTION_MAX + 1) })).toEqual({
      ok: false,
      errors: {
        name: "Name is required.",
        description: `Description must be at most ${ROUTINE_DESCRIPTION_MAX} characters.`,
        items: "Add at least one exercise.",
      },
    });
  });
});
