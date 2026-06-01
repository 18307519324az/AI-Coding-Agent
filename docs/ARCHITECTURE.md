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
- `GET /api/jobs`
- `POST /api/jobs/process-next`
- `POST /api/workspaces/cleanup`

Task detail responses include approvals, logs, diff, test results, related jobs, and E2E artifact references for Playwright reports and representative screenshots.

The runner can operate in two execution modes:

- `mock`: deterministic task flow for UI iteration, local tests, and demos without cloning external repositories.
- `workspace`: clones the target GitHub repository into a task-scoped workspace, analyzes `package.json` and relevant project files, then runs allowlisted verification commands after plan approval.

The runner can also operate in two task planning modes:

- `inline`: default mode where task creation immediately generates the plan.
- `queued`: `POST /api/tasks` creates the task, enqueues a `PLAN_TASK` job, and returns `202`; the runner entrypoint starts a single-process worker that polls the queue without overlapping processors, while `/api/jobs/process-next` remains available for manual processing.

In live PR mode, the PR approval gate also publishes the prepared branch through the same command policy: `git checkout -b`, `git add .`, bounded `git commit -m`, and approval-backed `git push`. The runner creates the GitHub draft PR only after that branch publish step succeeds.

The runner starts a workspace cleanup worker unless `RUNNER_WORKSPACE_CLEANUP=disabled`. Cleanup only removes task-scoped directories under `WORKSPACE_ROOT` for terminal tasks older than `RUNNER_WORKSPACE_RETENTION_HOURS`; active and recently updated tasks are retained.

The MVP store is in-memory by default, JSON file-backed with `RUNNER_STORE_FILE`, or SQLite-backed with `RUNNER_SQLITE_FILE` / `DATABASE_URL=file:...`. It persists tasks, approvals, logs, diffs, tests, E2E artifact references, repositories, and runner jobs. The Prisma schema and runner `db:*` scripts define the relational SQLite shape for a fuller database-backed implementation.

### Agent Core

Agent Core contains deterministic logic that should stay easy to unit test:

- State machine and failure mapping.
- Command allowlist and approval requirements.
- Secret redaction.
- GitHub repository and issue URL parsing.
- Plan and self-review output helpers.
- PR body generation.

### Model Adapter

The runner owns the model boundary. By default it uses the deterministic planner from `agent-core`; when `OPENAI_AGENT_MODE=live`, it calls the OpenAI Responses API with strict JSON schemas for `PlanOutput` and bounded file-edit implementation output. The API key stays in environment variables, file edits are validated against the task workspace, and the Web/API contract still receives the same validated task, diff, test, and self-review shape.

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
- Add job retries, backoff, and configurable concurrency limits.
