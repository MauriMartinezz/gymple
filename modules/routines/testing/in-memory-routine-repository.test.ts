import { describeRoutineRepositoryContract } from "./routine-repository-contract";
import { InMemoryRoutineRepository } from "./in-memory-routine-repository";

describeRoutineRepositoryContract("in-memory", async () => {
  const repo = new InMemoryRoutineRepository();
  repo.addExercise(1, 10);
  repo.addExercise(1, 11); // archived exercises still belong to their owner
  repo.addExercise(2, 20);
  return { repo, alice: 1, bob: 2, aliceExercises: [10, 11], bobExercise: 20, missingExercise: 99 };
});
