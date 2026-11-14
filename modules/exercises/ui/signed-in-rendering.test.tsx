import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Exercise } from "../domain/exercise";

/*
 * Pins the signed-in markup of the exercise list and form, so sharing them
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
  archiveExerciseAction: async () => {},
  restoreExerciseAction: async () => {},
}));

const { ExerciseList } = await import("./exercise-list");
const { ExerciseForm } = await import("./exercise-form");

const squat: Exercise = { id: 3, name: "Squat", muscleGroup: "legs", notes: null, archivedAt: null };
const curl: Exercise = { id: 4, name: "Curl", muscleGroup: "biceps", notes: "EZ bar", archivedAt: new Date(0) };

describe("signed-in exercise UI", () => {
  it("renders the empty list as before", () => {
    expect(renderToStaticMarkup(<ExerciseList active={[]} archived={[]} />)).toMatchSnapshot();
  });

  it("renders active and archived exercises as before", () => {
    expect(renderToStaticMarkup(<ExerciseList active={[squat]} archived={[curl]} />)).toMatchSnapshot();
  });

  it("renders the form as before", () => {
    const html = renderToStaticMarkup(
      <ExerciseForm
        action={async (state) => state}
        initialValues={{ name: "Squat", muscleGroup: "legs", notes: "" }}
        submitLabel="Save changes"
      />,
    );
    expect(html).toContain('href="/exercises"');
    expect(html).toMatchSnapshot();
  });
});
