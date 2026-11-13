import { describeSessionRepositoryContract } from "./session-repository-contract";
import { InMemorySessionRepository } from "./in-memory-session-repository";

describeSessionRepositoryContract("in-memory", async () => {
  const repo = new InMemorySessionRepository();
  repo.addExercise(1, 10);
  repo.addExercise(1, 11);
  repo.addExercise(1, 12, { archived: true });
  repo.addExercise(2, 20);
  repo.addRoutine(1, 100);
  repo.addRoutine(1, 101, { archived: true });
  repo.addRoutine(2, 200);
  return {
    repo,
    alice: 1,
    bob: 2,
    aliceExercises: { first: 10, second: 11, archived: 12 },
    bobExercise: 20,
    missingExercise: 99,
    aliceRoutines: { active: 100, archived: 101 },
    bobRoutine: 200,
    missingRoutine: 999,
    archiveExercise: async (exerciseId) => repo.archiveExercise(exerciseId),
  };
});
