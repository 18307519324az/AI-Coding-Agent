---
name: eval-regression
description: Maintain Agent eval cases and regression tests for planning, command policy, UI polish, and PR summary behavior.
---

# Eval Regression

Eval case shape:

```json
{
  "id": "fix-simple-ts-error",
  "repoFixture": "fixtures/simple-ts-app",
  "prompt": "Fix the TypeScript error.",
  "expectedFilesChanged": ["src/index.ts"],
  "mustRunCommands": ["pnpm typecheck"],
  "forbiddenCommands": ["rm -rf"],
  "successCriteria": ["typecheck passes", "diff is minimal"]
}
```

Rules:

- Keep cases small and deterministic.
- Include forbidden command assertions.
- Include expected changed files.
- Include must-run verification commands.
- Add a regression case for every safety bug.

