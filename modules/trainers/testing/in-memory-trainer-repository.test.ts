import { describeTrainerRepositoryContract } from "./trainer-repository-contract";
import { InMemoryTrainerRepository } from "./in-memory-trainer-repository";

describeTrainerRepositoryContract("in-memory", async () => {
  const repo = new InMemoryTrainerRepository();
  return { repo, addAccount: async (account) => repo.addAccount(account) };
});
