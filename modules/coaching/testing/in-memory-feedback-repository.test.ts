import { describeFeedbackRepositoryContract } from "./feedback-repository-contract";
import { InMemoryCoachingRepository } from "./in-memory-coaching-repository";
import { InMemoryFeedbackRepository } from "./in-memory-feedback-repository";

describeFeedbackRepositoryContract("in-memory", async () => {
  const people = new InMemoryCoachingRepository();
  let nextId = 1;
  return {
    repo: new InMemoryFeedbackRepository(people),
    addUser: async (user) => people.addUser(user),
    addExercise: async () => nextId++,
    addWorkout: async () => nextId++,
  };
});
