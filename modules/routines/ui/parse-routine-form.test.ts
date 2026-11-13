import { describe, expect, it } from "vitest";
import { readRoutineForm } from "./parse-routine-form";

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const item = (exerciseId: string) => ({
  exerciseId,
  targetSets: "",
  targetRepsMin: "",
  targetRepsMax: "",
  restSeconds: "",
  notes: "",
});

describe("readRoutineForm", () => {
  it("reads the name, description and every item field", () => {
    const values = readRoutineForm(
      form([
        ["name", "Push day"],
        ["description", "Heavy"],
        ["items.0.exerciseId", "4"],
        ["items.0.targetSets", "3"],
        ["items.0.targetRepsMin", "8"],
        ["items.0.targetRepsMax", "12"],
        ["items.0.restSeconds", "90"],
        ["items.0.notes", "Pause at the bottom"],
      ]),
    );

    expect(values).toEqual({
      name: "Push day",
      description: "Heavy",
      items: [
        {
          exerciseId: "4",
          targetSets: "3",
          targetRepsMin: "8",
          targetRepsMax: "12",
          restSeconds: "90",
          notes: "Pause at the bottom",
        },
      ],
    });
  });

  it("orders items by their numeric index, not by submission order", () => {
    const values = readRoutineForm(
      form([
        ["items.10.exerciseId", "3"],
        ["items.2.exerciseId", "2"],
        ["items.0.exerciseId", "1"],
      ]),
    );

    expect(values.items.map((i) => i.exerciseId)).toEqual(["1", "2", "3"]);
  });

  it("closes gaps left by missing indexes", () => {
    const values = readRoutineForm(form([["items.0.exerciseId", "1"], ["items.5.exerciseId", "2"]]));

    expect(values.items).toEqual([item("1"), item("2")]);
  });

  it("ignores malformed keys and unknown fields", () => {
    const values = readRoutineForm(
      form([
        ["items.0.exerciseId", "1"],
        ["items.-1.exerciseId", "9"],
        ["items.1e3.exerciseId", "9"],
        ["items..exerciseId", "9"],
        ["items.0.userId", "2"],
        ["items.0.exerciseId.x", "9"],
        ["items.01.exerciseId", "9"],
        ["items[1].exerciseId", "9"],
        ["items.1.__proto__", "9"],
      ]),
    );

    expect(values.items).toEqual([item("1")]);
  });

  it("returns empty strings for missing fields and no items", () => {
    expect(readRoutineForm(form([]))).toEqual({ name: "", description: "", items: [] });
  });
});
