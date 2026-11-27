import { afterAll, describe, expect, it, vi } from "vitest";

// The pool connects lazily, so importing the client opens no connection.
vi.stubEnv("DATABASE_URL", "postgres://user:password@localhost:1/unused");
const { db } = await import("./client");

afterAll(async () => {
  await db.$client.end();
  vi.unstubAllEnvs();
});

describe("database client", () => {
  it("survives an error on an idle connection instead of crashing the process", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    // pg-pool re-emits idle-client errors (server closed the connection) on the pool.
    expect(() => db.$client.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    expect(log).toHaveBeenCalledOnce();

    log.mockRestore();
  });
});
