import { describe, expect, it } from "vitest";
import type { RoutineItem } from "@/modules/routines/domain/routine";
import {
  DEFAULT_REST_SECONDS,
  describeRoutineChange,
  proposeRoutineUpdate,
  type ProposalSet,
} from "./routine-changes";

const BENCH = 1;
const DIPS = 2;
const FLY = 3;
const ROW = 4;

const item = (exerciseId: number, overrides: Partial<RoutineItem> = {}): RoutineItem => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 120,
  notes: null,
  ...overrides,
});

const routine = (items: RoutineItem[]) => ({ name: "Push day", description: "Chest first", items });

const set = (exerciseId: number, reps = 8, restSeconds: number | null = null): ProposalSet => ({
  exerciseId,
  reps,
  restSeconds,
});

const times = (count: number, make: () => ProposalSet) => Array.from({ length: count }, make);

describe("proposeRoutineUpdate", () => {
  it("proposes nothing when the session matches the template", () => {
    const template = routine([item(BENCH), item(DIPS)]);
    const sets = [...times(3, () => set(BENCH)), ...times(3, () => set(DIPS))];

    expect(proposeRoutineUpdate(sets, template)).toEqual({ changes: [], input: template });
  });

  it("never removes or lowers anything: fewer sets and skipped exercises change nothing", () => {
    const template = routine([item(BENCH, { targetSets: 4 }), item(DIPS)]);

    expect(proposeRoutineUpdate([set(BENCH), set(BENCH)], template)).toEqual({ changes: [], input: template });
    expect(proposeRoutineUpdate([], template)).toEqual({ changes: [], input: template });
  });

  it("raises targetSets when more sets were logged, keeping the item's other targets", () => {
    const template = routine([item(BENCH, { notes: "Pause reps" }), item(DIPS)]);
    const sets = times(4, () => set(BENCH, 5, 60));

    expect(proposeRoutineUpdate(sets, template)).toEqual({
      changes: [{ type: "raise_sets", exerciseId: BENCH, from: 3, to: 4 }],
      input: routine([item(BENCH, { notes: "Pause reps", targetSets: 4 }), item(DIPS)]),
    });
  });

  it("matches extra sets to the first occurrence of a repeated exercise", () => {
    const template = routine([item(BENCH, { targetSets: 2 }), item(DIPS), item(BENCH, { targetSets: 5 })]);
    const sets = times(4, () => set(BENCH));

    expect(proposeRoutineUpdate(sets, template)).toEqual({
      changes: [{ type: "raise_sets", exerciseId: BENCH, from: 2, to: 4 }],
      input: routine([item(BENCH, { targetSets: 4 }), item(DIPS), item(BENCH, { targetSets: 5 })]),
    });
  });

  it("appends exercises not in the routine, in the order first logged", () => {
    const template = routine([item(BENCH)]);
    const sets = [set(FLY, 12, 45), set(DIPS, 10), set(FLY, 15, 30), set(DIPS, 8), set(DIPS, 9)];

    expect(proposeRoutineUpdate(sets, template)).toEqual({
      changes: [
        { type: "add_exercise", exerciseId: FLY, targetSets: 2, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 45 },
        {
          type: "add_exercise",
          exerciseId: DIPS,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          restSeconds: DEFAULT_REST_SECONDS,
        },
      ],
      input: routine([
        item(BENCH),
        { exerciseId: FLY, targetSets: 2, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 45, notes: null },
        { exerciseId: DIPS, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 90, notes: null },
      ]),
    });
  });

  it("uses the first rest logged on the new exercise's sets, even after sets without one", () => {
    const sets = [set(DIPS, 8, null), set(DIPS, 8, 0), set(DIPS, 8, 120)];

    const { changes } = proposeRoutineUpdate(sets, routine([item(BENCH)]));

    expect(changes).toEqual([expect.objectContaining({ exerciseId: DIPS, restSeconds: 0 })]);
  });

  it("defaults the rest of a new exercise to 90 seconds", () => {
    expect(DEFAULT_REST_SECONDS).toBe(90);
  });

  it("combines raises and additions: raises in routine order, then additions", () => {
    const template = routine([item(BENCH), item(ROW, { targetSets: 1 })]);
    const sets = [set(DIPS, 6), set(ROW), set(ROW), ...times(4, () => set(BENCH))];

    expect(proposeRoutineUpdate(sets, template).changes).toEqual([
      { type: "raise_sets", exerciseId: BENCH, from: 3, to: 4 },
      { type: "raise_sets", exerciseId: ROW, from: 1, to: 2 },
      { type: "add_exercise", exerciseId: DIPS, targetSets: 1, targetRepsMin: 6, targetRepsMax: 6, restSeconds: 90 },
    ]);
  });

  it("does not modify the routine or sets it was given", () => {
    const template = routine([item(BENCH)]);
    const before = structuredClone(template);
    const sets = [...times(5, () => set(BENCH)), set(DIPS)];

    proposeRoutineUpdate(sets, template);

    expect(template).toEqual(before);
  });

  it("keeps the routine's name and description", () => {
    const { input } = proposeRoutineUpdate([set(DIPS)], routine([item(BENCH)]));

    expect(input).toMatchObject({ name: "Push day", description: "Chest first" });
  });
});

describe("describeRoutineChange", () => {
  it("summarizes an added exercise with its sets and reps range", () => {
    const change = {
      type: "add_exercise",
      exerciseId: DIPS,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
      restSeconds: 90,
    } as const;

    expect(describeRoutineChange(change, "Dips")).toBe("Add Dips (3 × 8–10)");
    expect(describeRoutineChange({ ...change, targetRepsMax: 8 }, "Dips")).toBe("Add Dips (3 × 8)");
  });

  it("summarizes raised sets", () => {
    expect(describeRoutineChange({ type: "raise_sets", exerciseId: BENCH, from: 3, to: 4 }, "Bench press")).toBe(
      "Bench press: 3 → 4 sets",
    );
  });
});
