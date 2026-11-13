import { describeExerciseRepositoryContract } from "./exercise-repository-contract";
import { InMemoryExerciseRepository } from "./in-memory-exercise-repository";

describeExerciseRepositoryContract("in-memory", async () => ({
  repo: new InMemoryExerciseRepository(),
  alice: 1,
  bob: 2,
}));
