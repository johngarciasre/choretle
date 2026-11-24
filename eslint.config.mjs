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
    // Local tooling and generated state, not source:
    "supabase/**",
    ".qwen/**",
    ".opencode/**",
    ".plans/**",
    "data/**",
    "coverage/**",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Raw SQLite rows and Drizzle's snake_case results are untyped, so `any`
      // is the project's documented escape hatch (see AGENTS.md).
      "@typescript-eslint/no-explicit-any": "off",
      // Allow intentionally unused parameters (e.g. required-but-unused
      // framework callbacks) when they are prefixed with an underscore.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // The app loads data on mount through fetch helpers; that pattern is
      // deliberate, so surface it rather than failing the build over it.
      "react-hooks/set-state-in-effect": "warn",
      // No basePath is configured, so relative location destinations are fine.
      "@next/next/no-location-assign-relative-destination": "off",
      // Avatars and chore photos come from arbitrary user-supplied hosts, which
      // next/image cannot allow-list without a remotePatterns config per host.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
