---
name: issue-to-pr
description: Implement or run the approved Issue-to-PR workflow from GitHub issue input through plan, patch, tests, review, and PR draft.
---

# Issue To PR

Flow:

1. Parse repository URL and optional issue URL.
2. Clone into a task workspace.
3. Analyze package metadata and relevant files.
4. Generate a plan and wait for user approval.
5. Apply a minimal patch.
6. Run lint, typecheck, unit tests, and E2E when relevant.
7. Generate diff, self-review, risks, and PR body.
8. Wait for PR creation approval.
9. Push branch and create draft PR.

Never:

- Push directly to main.
- Create a PR before approval.
- Hide failed tests.
- Leak tokens in logs.

