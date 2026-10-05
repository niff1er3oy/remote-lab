import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plain CommonJS custom server (boots Next.js), intentionally outside the
    // Next.js/TS module graph — see DESIGN.md.
    "server.js",
    // Local agent tooling (plain CommonJS scripts), not part of the app.
    ".claude/**",
    // Jest's coverage report.
    "coverage/**",
  ]),
]);

export default eslintConfig;
