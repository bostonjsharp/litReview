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
    // Prototype/reference files — not compiled or imported by the app
    "handoff/**",
  ]),
  {
    // `any` is used deliberately at the database-injection seams (pipeline,
    // retrieve, answer) where threading Drizzle's full generic table-union
    // types through dependency-injected handles is impractical. Keep it
    // visible as a warning rather than failing the build.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Test files use `any` freely for mocks/stubs.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
