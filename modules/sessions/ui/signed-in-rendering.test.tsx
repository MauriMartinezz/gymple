import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LoggedSet } from "../domain/session";
import type { ActiveSessionView } from "./session-view";

/*
 * Pins the signed-in markup of the workout components, so sharing them with
 * guest mode leaves the signed-in pages byte-identical.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./actions", () => ({
  startSessionAction: async () => ({}),
  logSetAction: async () => ({ errors: {}, values: null }),
  editSetAction: async () => ({ errors: {}, values: null }),
  deleteSetAction: async () => ({}),
  finishSessionAction: async () => ({ errors: {}, values: { notes: "" } }),
  discardSessionAction: async () => {},
  deleteSessionAction: async () => {},
}));

const { ActiveSession } = await import("./active-session");
const { FinishForm } = await import("./finish-form");
const { StartSessionButton } = await import("./start-session-button");
const { SetRow } = await import("./set-forms");

const set = (id: number, setNumber: number, overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id,
  exerciseId: 3,
  setNumber,
  weightKg: 80,
  reps: 8,
  rpe: null,
  restSeconds: null,
  completedAt: new Date(0),
  ...overrides,
});

const view: ActiveSessionView = {
  id: 7,
  title: "Push day",
  startedAt: new Date(0),
  cards: [
    {
      exerciseId: 3,
      name: "Bench press",
      targets: [{ sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 }],
      plannedSets: 3,
      sets: [set(1, 1), set(2, 2, { rpe: 8.5, restSeconds: 90 })],
      prefill: { weightKg: "80", reps: "8", restSeconds: "90" },
      lastTime: "Last time: 75 kg × 8",
      suggestion: { text: "Suggested by Ana: 85 kg × 6", sets: "4 sets", note: "Slow down" },
    },
    {
      exerciseId: 4,
      name: "Dips",
      targets: [],
      plannedSets: null,
      sets: [set(3, 1, { exerciseId: 4 })],
      prefill: { weightKg: "80", reps: "8", restSeconds: "" },
      lastTime: null,
      suggestion: null,
    },
  ],
  addable: [{ id: 5, name: "Fly", prefill: { weightKg: "", reps: "", restSeconds: "" } }],
  setCount: 3,
};

describe("signed-in workout UI", () => {
  it("renders the active workout as before", () => {
    const html = renderToStaticMarkup(<ActiveSession view={view} />);
    expect(html).toContain('href="/sessions/active/finish"');
    expect(html).toMatchSnapshot();
  });

  it("renders an empty active workout as before", () => {
    expect(renderToStaticMarkup(<ActiveSession view={{ ...view, cards: [], addable: [], setCount: 0 }} />)).toMatchSnapshot();
  });

  it("renders the finish form with and without routine changes as before", () => {
    const withChanges = renderToStaticMarkup(
      <FinishForm sessionId={7} routineName="Push day" changes={["Add Fly: 1 × 8"]} />,
    );
    expect(withChanges).toContain('href="/sessions/active"');
    expect(withChanges).toMatchSnapshot();
    expect(renderToStaticMarkup(<FinishForm sessionId={7} routineName={null} changes={[]} />)).toMatchSnapshot();
  });

  it("renders the start button as before", () => {
    expect(renderToStaticMarkup(<StartSessionButton routineId={null} label="Start free workout" size="sm" />)).toMatchSnapshot();
    expect(
      renderToStaticMarkup(<StartSessionButton routineId={5} label="Start" ariaLabel="Start Push day" size="sm" />),
    ).toMatchSnapshot();
  });

  it("renders a set row as before", () => {
    expect(renderToStaticMarkup(<SetRow sessionId={7} set={set(1, 1, { rpe: 9 })} exerciseName="Bench press" />)).toMatchSnapshot();
  });
});
