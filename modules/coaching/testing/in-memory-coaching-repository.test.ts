import { describeCoachingRepositoryContract } from "./coaching-repository-contract";
import { InMemoryCoachingRepository } from "./in-memory-coaching-repository";

describeCoachingRepositoryContract("in-memory", async () => {
  const repo = new InMemoryCoachingRepository();
  return { repo, addUser: async (user) => repo.addUser(user) };
});
