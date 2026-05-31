---
name: pr-summary
description: Generate PR body content with summary, tests, risk, changed files, and reviewer notes.
---

# PR Summary

PR body must include:

- Summary.
- Changed files.
- Tests run and status.
- Risk.
- Notes for reviewer.

Do not:

- Hide failed tests.
- Claim checks passed when they were skipped.
- Include secrets, raw tokens, or unnecessary logs.

Use `generatePullRequestBody` from `packages/agent-core` when possible.

