import { describe, expect, it } from "vitest";
import type { RoutineItem } from "@/modules/routines/domain/routine";
import type { LoggedSet, WorkoutSession } from "../domain/session";
import { buildActiveSessionView, formatDuration, formatTargets, groupSets, toHistoryEntry } from "./session-view";

const BENCH = 10;
const DIPS = 11;
const ROW = 12;
const OLD = 13;

const exercises = [
  { id: BENCH, name: "Bench press", archived: false },
  { id: DIPS, name: "Dips", archived: false },
  { id: ROW, name: "Row", archived: false },
  { id: OLD, name: "Old press", archived: true },
];

let nextId = 1;
const set = (exerciseId: number, overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: nextId++,
  exerciseId,
  setNumber: 1,
  weightKg: 80,
  reps: 8,
  rpe: null,
  restSeconds: null,
  completedAt: new Date(0),
  ...overrides,
});

const item = (exerciseId: number, overrides: Partial<RoutineItem> = {}): RoutineItem => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
  ...overrides,
});

const session = (sets: LoggedSet[], overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 1,
  routineId: 5,
  startedAt: new Date("2026-11-13T10:00:00Z"),
  finishedAt: null,
  notes: null,
  sets,
  ...overrides,
});

describe("buildActiveSessionView", () => {
  it("lists routine exercises in routine order, once each, then extra exercises in the order logged", () => {
    const view = buildActiveSessionView(
      session([set(ROW), set(DIPS), set(OLD)]),
      { name: "Push day", items: [item(DIPS), item(BENCH), item(DIPS)] },
      exercises,
      new Map(),
    );

    expect(view.title).toBe("Push day");
    expect(view.cards.map((c) => [c.name, c.plannedSets, c.sets.length])).toEqual([
      ["Dips", 6, 1],
      ["Bench press", 3, 0],
      ["Row", null, 1],
      ["Old press", null, 1],
    ]);
    expect(view.addable).toEqual([]);
  });

  it("shows every occurrence of a repeated exercise on its card, planned as their total", () => {
    const view = buildActiveSessionView(
      session([set(DIPS, { restSeconds: 90 }), set(DIPS, { setNumber: 2, restSeconds: 90 })]),
      {
        name: "Push day",
        items: [
          item(DIPS, { targetSets: 2, restSeconds: 90 }),
          item(BENCH),
          item(DIPS, { targetSets: 1, targetRepsMin: 15, targetRepsMax: 15, restSeconds: 45 }),
        ],
      },
      exercises,
      new Map(),
    );

    const dips = view.cards[0];
    expect(dips.targets).toEqual([
      { sets: 2, repsMin: 8, repsMax: 12, restSeconds: 90 },
      { sets: 1, repsMin: 15, repsMax: 15, restSeconds: 45 },
    ]);
    expect(dips.plannedSets).toBe(3);
    expect(formatTargets(dips.targets)).toBe("2 × 8–12 · 90 s rest, then 1 × 15 · 45 s rest");
    // The next set opens the second occurrence, so its rest comes from there.
    expect(dips.prefill.restSeconds).toBe("45");
  });

  it("marks exercises added during the workout as unplanned", () => {
    const view = buildActiveSessionView(session([set(ROW)]), { name: "Push day", items: [item(BENCH)] }, exercises, new Map());

    expect(view.cards[1]).toMatchObject({ name: "Row", targets: [], plannedSets: null });
  });

  it("offers the active exercises that are not in the workout yet", () => {
    const view = buildActiveSessionView(session([set(DIPS)], { routineId: null }), null, exercises, new Map());

    expect(view.title).toBe("Free workout");
    expect(view.addable.map((e) => e.name)).toEqual(["Bench press", "Row"]);
  });

  it("prefills from this workout's last set of the exercise first, then from last time", () => {
    const last = new Map([
      [BENCH, set(BENCH, { weightKg: 70, reps: 10 })],
      [DIPS, set(DIPS, { weightKg: 0, reps: 12, restSeconds: 60 })],
    ]);
    const view = buildActiveSessionView(
      session([set(BENCH, { weightKg: 82.5, reps: 6, restSeconds: 120 })]),
      { name: "Push day", items: [item(BENCH), item(DIPS, { restSeconds: 45 })] },
      exercises,
      last,
    );

    expect(view.cards.map((c) => [c.prefill, c.lastTime])).toEqual([
      [{ weightKg: "82.5", reps: "6", restSeconds: "120" }, "Last time: 70 kg × 10"],
      [{ weightKg: "0", reps: "12", restSeconds: "45" }, "Last time: 0 kg × 12"],
    ]);
  });

  it("leaves the prefill empty for an exercise never logged", () => {
    const view = buildActiveSessionView(session([], { routineId: null }), null, exercises, new Map());

    expect(view.addable[0].prefill).toEqual({ weightKg: "", reps: "", restSeconds: "" });
  });
});

describe("buildActiveSessionView with load suggestions", () => {
  const suggestions = new Map([
    [BENCH, { trainerName: "Ana", weightKg: 85, reps: 6, sets: 4, note: "Pause on the chest" }],
    [DIPS, { trainerName: "Dani", weightKg: 10, reps: 8, sets: null, note: null }],
    [ROW, { trainerName: "Ana", weightKg: 70, reps: 10, sets: null, note: null }],
  ]);
  const last = new Map([
    [BENCH, set(BENCH, { weightKg: 70, reps: 10 })],
    [DIPS, set(DIPS, { weightKg: 0, reps: 12 })],
  ]);

  it("prefills from the suggestion while the exercise has no sets in this workout, keeping last time", () => {
    const view = buildActiveSessionView(
      session([]),
      { name: "Push day", items: [item(BENCH), item(DIPS, { restSeconds: 45 })] },
      exercises,
      last,
      suggestions,
    );

    expect(view.cards.map((c) => [c.prefill, c.lastTime, c.suggestion])).toEqual([
      [
        { weightKg: "85", reps: "6", restSeconds: "90" },
        "Last time: 70 kg × 10",
        { text: "Suggested by Ana: 85 kg × 6", sets: "4 sets", note: "Pause on the chest" },
      ],
      [
        { weightKg: "10", reps: "8", restSeconds: "45" },
        "Last time: 0 kg × 12",
        { text: "Suggested by Dani: 10 kg × 8", sets: null, note: null },
      ],
    ]);
    expect(view.addable.find((e) => e.id === ROW)?.prefill).toEqual({ weightKg: "70", reps: "10", restSeconds: "" });
  });

  it("prefills from the student's own last set once one is logged", () => {
    const view = buildActiveSessionView(
      session([set(BENCH, { weightKg: 80, reps: 5, restSeconds: 120 })]),
      { name: "Push day", items: [item(BENCH)] },
      exercises,
      last,
      suggestions,
    );

    expect(view.cards[0].prefill).toEqual({ weightKg: "80", reps: "5", restSeconds: "120" });
    expect(view.cards[0].suggestion?.text).toBe("Suggested by Ana: 85 kg × 6");
  });

  it("is unchanged without suggestions", () => {
    const routine = { name: "Push day", items: [item(BENCH), item(DIPS, { restSeconds: 45 })] };
    const workout = session([set(BENCH, { weightKg: 82.5, reps: 6, restSeconds: 120 })]);

    const without = buildActiveSessionView(workout, routine, exercises, last);
    const empty = buildActiveSessionView(workout, routine, exercises, last, new Map());

    expect(empty).toEqual(without);
    expect(without.cards.map((c) => [c.prefill, c.lastTime, c.suggestion])).toEqual([
      [{ weightKg: "82.5", reps: "6", restSeconds: "120" }, "Last time: 70 kg × 10", null],
      [{ weightKg: "0", reps: "12", restSeconds: "45" }, "Last time: 0 kg × 12", null],
    ]);
    expect(without.addable).toEqual([{ id: ROW, name: "Row", prefill: { weightKg: "", reps: "", restSeconds: "" } }]);
  });
});

describe("groupSets", () => {
  it("groups sets by exercise in the order first logged", () => {
    const groups = groupSets([set(DIPS), set(BENCH), set(DIPS, { setNumber: 2 })], exercises);

    expect(groups.map((g) => [g.name, g.sets.map((s) => s.setNumber)])).toEqual([
      ["Dips", [1, 2]],
      ["Bench press", [1]],
    ]);
  });
});

describe("toHistoryEntry", () => {
  const finished = session([set(BENCH), set(BENCH), set(DIPS)], {
    finishedAt: new Date("2026-11-13T11:05:00Z"),
  });

  it("names the routine and counts exercises, sets and duration", () => {
    expect(toHistoryEntry(finished, new Map([[5, "Push day"]]))).toMatchObject({
      title: "Push day",
      exerciseCount: 2,
      setCount: 3,
      duration: "1 h 5 min",
    });
  });

  it("calls a session without a known routine a free workout", () => {
    expect(toHistoryEntry({ ...finished, routineId: null }, new Map()).title).toBe("Free workout");
    expect(toHistoryEntry(finished, new Map()).title).toBe("Free workout");
  });
});

describe("formatDuration", () => {
  it.each([
    ["2026-11-13T10:45:00Z", "45 min"],
    ["2026-11-13T11:00:00Z", "1 h"],
    ["2026-11-13T09:00:00Z", "0 min"],
  ])("formats a workout ending at %s as %s", (end, expected) => {
    expect(formatDuration(new Date("2026-11-13T10:00:00Z"), new Date(end))).toBe(expected);
  });
});
