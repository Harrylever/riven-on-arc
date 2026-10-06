import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pulls in eslint-config-prettier (turns off stylistic rules that would
  // conflict with Prettier) and runs Prettier itself as `prettier/prettier`.
  eslintPluginPrettierRecommended,
  {
    rules: {
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
