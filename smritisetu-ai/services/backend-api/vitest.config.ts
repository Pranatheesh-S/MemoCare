import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
    // The suite shares one PostgreSQL database, so files run one at a time.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
