import nextJest from "next/jest.js";

// next/jest sets Jest up the way Next.js builds the app: the same compiler,
// stylesheets and images mocked, and next.config.ts and .env loaded.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  coverageProvider: "v8",
  // What `npm run test:coverage` reports on, tested or not.
  collectCoverageFrom: ["lib/**/*.ts", "app/**/*.{ts,tsx}"],
  testEnvironment: "jsdom",
  // jest.env.ts swaps the real credentials from .env for test values before
  // any module loads; jest.setup.ts blocks Firebase and the network.
  setupFiles: ["<rootDir>/jest.env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Shared test helpers live here; they are not test files themselves.
  testPathIgnorePatterns: ["<rootDir>/__tests__/helpers/"],
  moduleNameMapper: {
    // The "@/…" import alias from tsconfig.json.
    "^@/(.*)$": "<rootDir>/$1",
  },
};

// Exported through createJestConfig so next/jest can load the Next.js config,
// which is async.
export default createJestConfig(config);
