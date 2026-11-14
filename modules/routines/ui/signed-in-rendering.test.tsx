import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Routine } from "../domain/routine";

/*
 * Pins the signed-in markup of the routine list and form, so sharing them
 * with guest mode leaves the signed-in pages byte-identical.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./actions", () => ({
  archiveRoutineAction: async () => {},
  restoreRoutineAction: async () => {},
}));
vi.mock("@/modules/sessions/ui/start-session-button", () => ({
  StartSessionButton: ({ routineId, label, ariaLabel }: { routineId: number; label: string; ariaLabel?: string }) => (
    <button data-start-routine={routineId} aria-label={ariaLabel}>
      {label}
    </button>
  ),
}));

const { RoutineList } = await import("./routine-list");
const { RoutineForm } = await import("./routine-form");

const item = { exerciseId: 3, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null };
const push: Routine = { id: 5, name: "Push day", description: null, items: [item, item], archivedAt: null };
const legs: Routine = { id: 6, name: "Legs", description: "Heavy", items: [item], archivedAt: new Date(0) };

describe("signed-in routine UI", () => {
  it("renders the empty list as before", () => {
    expect(renderToStaticMarkup(<RoutineList active={[]} archived={[]} />)).toMatchSnapshot();
  });

  it("renders active and archived routines with a start button as before", () => {
    const html = renderToStaticMarkup(<RoutineList active={[push]} archived={[legs]} />);
    expect(html).toContain('data-start-routine="5"');
    expect(html).toMatchSnapshot();
  });

  it("renders the form as before", () => {
    const html = renderToStaticMarkup(
      <RoutineForm
        action={async (state) => state}
        exercises={[
          { id: 3, name: "Squat", archived: false },
          { id: 4, name: "Curl", archived: true },
        ]}
        submitLabel="Create routine"
      />,
    );
    expect(html).toContain('href="/routines"');
    expect(html).toMatchSnapshot();
  });
});
