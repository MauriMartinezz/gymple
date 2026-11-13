import { describe, expect, it } from "vitest";
import type { RoutineItem } from "@/modules/routines/domain/routine";
import type { LoggedSet, WorkoutSession } from "../domain/session";
import { buildActiveSessionView, formatDuration, groupSets, toHistoryEntry } from "./session-view";

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
    expect(view.cards.map((c) => [c.name, c.target?.sets ?? null, c.sets.length])).toEqual([
      ["Dips", 3, 1],
      ["Bench press", 3, 0],
      ["Row", null, 1],
      ["Old press", null, 1],
    ]);
    expect(view.addable).toEqual([]);
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
