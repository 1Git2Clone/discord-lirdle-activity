import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig(
  js.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
