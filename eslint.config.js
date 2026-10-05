import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".data/**", "coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: { security },
    rules: {
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-fs-filename": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
