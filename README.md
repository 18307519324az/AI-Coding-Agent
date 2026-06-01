# AI Coding Agent

AI Coding Agent is a developer-focused automation console for turning GitHub issues, bug reports, and feature requests into reviewed, tested Pull Request drafts.

The repository is a pnpm TypeScript monorepo with:

- `apps/web`: Next.js Web console with realistic task, approval, trace, log, diff, test, and PR states.
- `apps/runner`: Fastify Agent Runner API with in-memory MVP storage and guarded command execution primitives.
- `packages/shared`: Zod schemas and shared domain types.
- `packages/agent-core`: state machine, command allowlist, log redaction, GitHub URL parsing, plan output, and PR summary helpers.
- `.agents/skills`: repository-level Codex skills matching the PRD workflows.

## Quick Start

```bash
corepack enable
pnpm install
pnpm dev
```

Open the Web console at `http://localhost:3000`.

The runner starts at `http://localhost:8787`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

For CI parity:

```bash
pnpm ci
```

## Environment

Create local env files from examples when adding real integrations. Do not commit secrets.

Runner variables:

```bash
GITHUB_TOKEN=...
OPENAI_API_KEY=...
RUNNER_API_KEY=...
OPENAI_AGENT_MODE=deterministic # set to live to generate plans through OpenAI Responses API
OPENAI_MODEL=gpt-5.2
WORKSPACE_ROOT=.workspaces
RUNNER_ARTIFACT_DIR=.runner-data/artifacts
RUNNER_STORE_FILE=.runner-data/store.json
RUNNER_SQLITE_FILE=.runner-data/store.db
DATABASE_URL=file:./.runner-data/dev.db
RUNNER_EXECUTION_MODE=mock # set to workspace to clone/analyze repos and run allowlisted checks
RUNNER_JOB_MODE=inline # set to queued to enqueue plan generation jobs
RUNNER_JOB_WORKER_INTERVAL_MS=1000
RUNNER_WORKSPACE_RETENTION_HOURS=168
RUNNER_WORKSPACE_CLEANUP_INTERVAL_MS=3600000
RUNNER_WORKSPACE_CLEANUP=enabled # set to disabled to stop background cleanup
GITHUB_PR_MODE=simulated # set to live only after configuring GitHub credentials
RUNNER_PORT=8787
```

Web variables:

```bash
RUNNER_API_URL=http://127.0.0.1:8787
RUNNER_API_KEY=... # same value as the runner when API auth is enabled
NEXT_PUBLIC_RUNNER_API_URL=http://127.0.0.1:8787 # optional for unprotected local compatibility
```

## Safety Model

The runner treats shell execution as a policy decision, not a free-form chat action.

- Read-only commands are allowed without approval.
- Dependency install, push, PR creation, workflow trigger, and destructive operations require explicit approval or are blocked.
- Logs are redacted before storage.
- Runner API routes require `Authorization: Bearer <RUNNER_API_KEY>` when `RUNNER_API_KEY` is configured; `/health` stays public for probes.
- GitHub write operations must be approved before execution.
- Tasks use isolated workspace directories under `.workspaces/`.
- Playwright reports and screenshots are copied under `RUNNER_ARTIFACT_DIR`.
- Terminal task workspaces are retained for `RUNNER_WORKSPACE_RETENTION_HOURS` and then removed by the cleanup worker.

## MVP Flow

1. User creates an Agent Task from a repository URL, issue URL, or prompt.
2. Runner records the task and generates a structured plan inline, or queues plan generation when `RUNNER_JOB_MODE=queued`.
3. User approves or rejects the plan.
4. Runner executes guarded steps, records trace and logs, stores diff and test results.
5. Runner produces a self-review.
6. User approves PR creation.
7. In live PR mode, Runner creates a branch, commits the approved workspace diff, pushes the branch through the command allowlist, creates a draft PR, and records the PR URL. In default mode, PR creation remains simulated.

The default implementation keeps a deterministic mock flow for product iteration, unit tests, and UI verification. Set `OPENAI_AGENT_MODE=live` to generate task plans and bounded file edits through the OpenAI Responses API, and set `RUNNER_EXECUTION_MODE=workspace` to clone GitHub repositories into `.workspaces/`, analyze their project structure, apply approved implementation output, and run allowlisted verification commands after plan approval.

In queued mode, `POST /api/tasks` returns `202` with a `jobId`, task details include related jobs, `GET /api/jobs` lists queue state, and the runner entrypoint starts a non-overlapping worker that processes the next queued job on `RUNNER_JOB_WORKER_INTERVAL_MS`. `POST /api/jobs/process-next` remains available for operational retries and local debugging.

The runner also starts a workspace cleanup worker by default. It removes only terminal task directories under `WORKSPACE_ROOT` after the retention window, and `POST /api/workspaces/cleanup` can trigger the same cleanup pass manually.

## Live PR Smoke

Use a disposable GitHub test repository with a fast package test script. The smoke harness creates a real branch and draft Pull Request, so it requires explicit confirmation and repository-scoped credentials.

```bash
LIVE_PR_SMOKE_CONFIRM=create-draft-pr \
LIVE_PR_SMOKE_REPOSITORY_URL=https://github.com/example/test-repo \
LIVE_PR_SMOKE_RESULT_FILE=.runner-data/live-pr-smoke-result.json \
GITHUB_TOKEN=... \
pnpm smoke:live-pr
```

Set `LIVE_PR_SMOKE_ALLOW_INSTALL=1` when the test repository needs dependency installation before verification. The script rejects repository URLs that embed credentials, stores temporary workspaces under `.runner-data/live-pr-smoke-workspaces`, and can write a redacted result artifact with the created PR URL.

## Staging

```bash
cp deploy/staging.env.example .env.staging
docker compose --env-file .env.staging -f deploy/staging.compose.yml up --build
```

Use `docker-compose --env-file .env.staging -f deploy/staging.compose.yml up --build` on hosts that still provide the standalone Compose CLI.

The staging compose stack runs Web and Runner separately, protects Runner with `RUNNER_API_KEY`, and keeps workspaces/artifacts in named Docker volumes.
