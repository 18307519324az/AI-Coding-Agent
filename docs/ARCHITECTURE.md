# Architecture

AI Coding Agent is split into a user-facing console and a guarded execution runner. The product boundary is intentionally explicit: the browser never executes commands and the runner never performs high-risk operations without an approval record.

```text
User
  -> Web Console
  -> Runner API
  -> Agent Core
  -> Isolated Workspace
  -> GitHub / Tests / Playwright / OpenAI
```

## Monorepo Layout

- `apps/web`: Next.js application for task creation, monitoring, approvals, logs, diffs, test results, and PR drafts.
- `apps/runner`: Fastify service that owns tasks, approvals, command policy, workspace operations, and GitHub write gates.
- `packages/shared`: Zod schemas and TypeScript types used by Web and runner.
- `packages/agent-core`: pure Agent logic: state transitions, command policy, redaction, GitHub URL parsing, plan and PR body helpers.
- `.agents/skills`: repository-level Codex skills for repeatable development workflows.
- `evals`: regression cases for Agent behavior.

## Runtime Components

### Web Console

The Web console is an operational UI, not a marketing page. It provides:

- Dashboard metrics.
- Repository connection screens.
- Task list and task detail pages.
- Plan approval and PR approval controls.
- Log timeline.
- Diff preview.
- Test results.
- Self-review panel.

The current MVP uses deterministic mock data so UI and E2E behavior can be verified before wiring persistent APIs.

### Runner API

The runner exposes:

- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/logs`
- `GET /api/tasks/:taskId/diff`
- `POST /api/tasks/:taskId/approvals/:approvalId/approve`
- `POST /api/tasks/:taskId/approvals/:approvalId/reject`
- `POST /api/tasks/:taskId/create-pr`

The runner can operate in two execution modes:

- `mock`: deterministic task flow for UI iteration, local tests, and demos without cloning external repositories.
- `workspace`: clones the target GitHub repository into a task-scoped workspace, analyzes `package.json` and relevant project files, then runs allowlisted verification commands after plan approval.

The MVP store is in-memory by default and can be file-backed with `RUNNER_STORE_FILE`. The Prisma schema documents the SQLite persistence shape for a fuller database-backed implementation.

### Agent Core

Agent Core contains deterministic logic that should stay easy to unit test:

- State machine and failure mapping.
- Command allowlist and approval requirements.
- Secret redaction.
- GitHub repository and issue URL parsing.
- Plan and self-review output helpers.
- PR body generation.

## State Machine

```text
CREATED
  -> REPO_CLONING
  -> CONTEXT_ANALYZING
  -> PLAN_GENERATED
  -> WAITING_FOR_PLAN_APPROVAL
  -> IMPLEMENTING
  -> TESTING
  -> E2E_VERIFYING
  -> SELF_REVIEWING
  -> WAITING_FOR_PR_APPROVAL
  -> PR_CREATING
  -> COMPLETED
```

Failure states:

- `FAILED_CLONE`
- `FAILED_CONTEXT`
- `FAILED_IMPLEMENTATION`
- `FAILED_TEST`
- `FAILED_E2E`
- `FAILED_PR_CREATE`
- `CANCELLED`

## Approval Boundary

High-risk work is represented as an approval before execution:

- Plan approval before code edits.
- Dependency install approval.
- Push branch approval.
- Create PR approval.
- Workflow trigger approval.
- Delete branch approval.

This keeps the product auditable and prevents prompt text from becoming execution authority.

## Future Integration Points

- Replace in-memory store with SQLite Prisma repositories.
- Add OpenAI Responses API or Agents SDK planner/executor behind `packages/agent-core`.
- Add a persistent job queue for long-running tasks.
- Add model-driven patch application before workspace verification.
- Add branch commit and push before live Octokit PR creation.
- Add workspace cleanup jobs.
