---
name: security-review
description: Review runner, tools, GitHub operations, command execution, token handling, and approval gates for security regressions.
---

# Security Review

Focus areas:

- Command allowlist and blocked patterns.
- Approval gates before high-risk operations.
- Secret redaction in logs and metadata.
- Workspace path isolation.
- GitHub token scope.
- Prompt injection from issue text, repo files, and test logs.
- No direct push to main.

Required tests:

- Dangerous command rejection.
- Token redaction.
- Push requires approval.
- PR creation requires approval.
- Workspace escape attempts are rejected.

