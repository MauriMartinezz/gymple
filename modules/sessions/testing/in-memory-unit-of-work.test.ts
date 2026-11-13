import { describe, expect, it } from "vitest";
import { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import { InMemorySessionRepository } from "./in-memory-session-repository";
import { InMemoryUnitOfWork } from "./in-memory-unit-of-work";

const set = { weightKg: 80, reps: 8, rpe: null, restSeconds: null };
const item = { exerciseId: 10, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null };

function setup() {
  const sessions = new InMemorySessionRepository();
  const routines = new InMemoryRoutineRepository();
  sessions.addExercise(1, 10);
  routines.addExercise(1, 10);
  return { sessions, routines, uow: new InMemoryUnitOfWork(sessions, routines) };
}

describe("InMemoryUnitOfWork", () => {
  it("keeps both repositories' writes when the work succeeds", async () => {
    const { sessions, routines, uow } = setup();

    const result = await uow.run(async (repos) => {
      const routine = await repos.routines.create(1, { name: "Push", description: null, items: [item] });
      const session = await repos.sessions.start(1, null);
      return { routine, session };
    });

    expect(await routines.findById(1, result.routine.id)).toEqual(result.routine);
    expect(await sessions.findActive(1)).toEqual(result.session);
  });

  it("restores both repositories when the work throws", async () => {
    const { sessions, routines, uow } = setup();
    const routine = await routines.create(1, { name: "Push", description: null, items: [item] });
    const session = await sessions.start(1, null);
    await sessions.addSet(1, session.id, 10, set);
    const before = await sessions.findById(1, session.id);

    await expect(
      uow.run(async (repos) => {
        await repos.sessions.finish(1, session.id, "done");
        await repos.routines.update(1, routine.id, { name: "Renamed", description: null, items: [item, item] });
        await repos.routines.create(1, { name: "Extra", description: null, items: [item] });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await sessions.findById(1, session.id)).toEqual(before);
    expect(await routines.list(1, { archived: false })).toEqual([routine]);
    // Id counters are restored too, so later writes behave as if nothing happened.
    expect((await routines.create(1, { name: "Next", description: null, items: [item] })).id).toBe(routine.id + 1);
  });
});
