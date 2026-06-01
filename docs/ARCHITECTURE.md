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
- `deploy`: staging Dockerfiles, compose wiring, and example environment for Web + Runner.

## Runtime Components

### Web Console

The Web console is an operational UI, not a marketing page. It provides:

- Dashboard metrics.
- Repository connection screens.
- Task list and task detail pages.
- Runner job queue page with attempts, retry backoff, and terminal errors.
- Plan approval and PR approval controls.
- Log timeline and execution trace.
- Diff preview.
- Test results.
- Self-review panel.

The current MVP uses deterministic mock data so UI and E2E behavior can be verified before wiring persistent APIs.

When `WEB_AUTH_PASSWORD` is configured, the Web console protects pages and `/api/*` proxy routes with an HTTP-only session cookie issued by `/login`. When it is unset, local development remains open.

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
- `GET /api/metrics`
- `POST /api/jobs/process-next`
- `POST /api/workspaces/cleanup`

Task detail responses include approvals, trace events, logs, diff, test results, related jobs, and E2E artifacts. `/api/metrics` reports task, job, approval, log, and trace counts for staging and operations monitoring. Trace events are separate state-transition records, while logs carry detailed runner messages. When workspace E2E execution runs Playwright, the runner copies `playwright-report/` and `test-results/**/*.png` into the configured artifact directory before exposing report and screenshot paths.

The runner can operate in two execution modes:

- `mock`: deterministic task flow for UI iteration, local tests, and demos without cloning external repositories.
- `workspace`: clones the target GitHub repository into a task-scoped workspace, analyzes `package.json` and relevant project files, then runs allowlisted verification commands after plan approval.

The runner can also operate in two task planning modes:

- `inline`: default mode where task creation immediately generates the plan.
- `queued`: `POST /api/tasks` creates the task, enqueues a `PLAN_TASK` job, and returns `202`; the runner entrypoint starts a worker that polls the queue without exceeding the configured concurrency, while `/api/jobs/process-next` remains available for manual processing. Failed jobs are retried with `nextRunAt` backoff until `maxAttempts` is exhausted.

In live PR mode, the PR approval gate also publishes the prepared branch through the same command policy: `git checkout -b`, `git add .`, bounded `git commit -m`, and approval-backed `git push`. The runner creates the GitHub draft PR only after that branch publish step succeeds.

The runner starts a workspace cleanup worker unless `RUNNER_WORKSPACE_CLEANUP=disabled`. Cleanup only removes task-scoped directories under `WORKSPACE_ROOT` for terminal tasks older than `RUNNER_WORKSPACE_RETENTION_HOURS`; active and recently updated tasks are retained.

The first-release store is in-memory by default, JSON file-backed with `RUNNER_STORE_FILE`, or SQLite-backed with `RUNNER_SQLITE_FILE` / `DATABASE_URL=file:...`. It persists tasks, approvals, trace events, logs, diffs, tests, E2E artifact metadata, repositories, and runner jobs. In queued mode, same-host runner processes use `RUNNER_JOB_WORKER_LOCK_FILE` as a shared worker lease so only one process drains the queue at a time. Playwright report and screenshot files are copied under `RUNNER_ARTIFACT_DIR` or `.runner-data/artifacts`. The Prisma schema and runner `db:*` scripts define the relational SQLite target shape for a later repository-backed store. See `docs/RELEASE_DECISIONS.md` for the first-release storage boundary.

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

- Add Prisma/PostgreSQL runtime repositories when the runner needs centralized multi-host persistence.
- Replace same-host file leasing with transactional database or queue leases before distributing workers across multiple hosts.
- Scale worker concurrency only after command execution isolation and workspace capacity have been reviewed.
