import globals from "globals";

const sharedRules = {
  "no-unused-vars": "error",
  "no-undef": "error",
  eqeqeq: "error",
};

export default [
  {
    ignores: ["node_modules/**", "data/**"],
  },
  {
    files: ["src/**/*.js", "tests/**/*.js", "server.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
  {
    // The E2E script runs in Node but injects callbacks into the browser via
    // page.evaluate(), so it needs both sets of globals.
    files: ["tests/e2e.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: sharedRules,
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: sharedRules,
  },
];
