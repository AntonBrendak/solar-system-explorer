import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["{app,widgets,features,entities,shared,i18n}/**/*.{ts,tsx}"],
    rules: {
      "no-console": [
        "warn",
        { allow: ["warn", "error"] },
      ],
      "no-debugger": "error",
    },
  },
  {
    files: ["shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/app/**",
            "@/widgets/**",
            "@/features/**",
            "@/entities/**",
            "@/i18n/**",
            "@/messages/**",
          ],
        },
      ],
    },
  },
  {
    files: ["entities/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/app/**",
            "@/widgets/**",
            "@/features/**",
            "@/shared/ui/**",
            "@/i18n/**",
          ],
        },
      ],
    },
  },
  ...[
    "explorer",
    "localization",
    "ephemeris",
    "motion",
    "planet-viewer",
    "weather",
  ].map((feature, _, features) => ({
    files: [`features/${feature}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/app/**",
            "@/widgets/**",
            ...features
              .filter((other) => other !== feature)
              .flatMap((other) => [
                `@/features/${other}`,
                `@/features/${other}/**`,
              ]),
          ],
        },
      ],
    },
  })),
  {
    files: ["widgets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/**"],
              message:
                "Import a feature's public index instead of its internal modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["features/planet-viewer/model/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "../ui/**",
            "../scenes/**",
            "@/features/planet-viewer/ui/**",
            "@/features/planet-viewer/scenes/**",
            "@/widgets/**",
            "@/app/**",
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    ".wrangler/**",
    ".vinext/**",
    ".cloudflare/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
