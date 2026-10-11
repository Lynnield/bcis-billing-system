// ESLint flat config. The rules that matter most here:
// - react-hooks/rules-of-hooks: catches the "Rendered fewer hooks than
//   expected" class of bug recorded in tests/acceptance-test-report.md.
// - react-hooks/exhaustive-deps (warn): stale-closure bugs in effects.
// - no-restricted-imports: the renderer must never reach Node/Electron or a
//   database driver directly (spec 2.3) — only window.bcis.*.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["out/**", "dist/**", "release/**", "node_modules/**", "build/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: ["electron", "pg", "drizzle-orm", "node:fs", "fs", "node:child_process", "child_process"],
          patterns: [{ group: ["electron/*", "node:*"], message: "The renderer may only use window.bcis.* (spec 2.3)." }],
        },
      ],
    },
  },
  {
    files: ["src/main/**/*.ts", "src/preload/**/*.ts", "tests/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    // Several tests are compile-time contract checks that declare typed
    // values purely so tsc verifies their shape against the API types.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-unused-vars": "off", "@typescript-eslint/no-unused-expressions": "off" },
  },
);
