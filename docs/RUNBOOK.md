# Operations Runbook

## Runner Offline

Symptoms:

- Web console shows runner offline.
- New task creation fails.
- Logs stop updating.

Checks:

```bash
curl http://localhost:8787/health
pnpm --filter runner dev
```

Actions:

- Confirm `RUNNER_PORT`.
- Check process logs.
- If `RUNNER_API_KEY` is enabled, confirm Web and Runner have the same server-side value.
- If `WEB_AUTH_PASSWORD` is enabled, confirm the operator can sign in at `/login`.
- Confirm workspace directory is writable.
- Confirm secrets are present only in environment variables.

## Runner API Unauthorized

Symptoms:

- Web console falls back to mock data or shows runner errors.
- Runner API returns `401 Unauthorized` for non-health routes.
- `/health` still returns `200`.

Checks:

```bash
curl http://localhost:8787/health
curl -H "Authorization: Bearer $RUNNER_API_KEY" http://localhost:8787/api/tasks
```

Actions:

- Confirm `RUNNER_API_KEY` is set on the Runner.
- Confirm the same `RUNNER_API_KEY` is set on the Web service as a server-side secret.
- Confirm browser code is calling `/api/runner/*` proxy routes instead of sending credentials directly to the Runner.

## Web Console Login Failure

Symptoms:

- Protected pages redirect to `/login`.
- Browser-originated `/api/*` calls return `401 Authentication required.`

Checks:

- Confirm `WEB_AUTH_USERNAME` and `WEB_AUTH_PASSWORD` match the operator credentials.
- Confirm `WEB_AUTH_SESSION_SECRET` is stable across Web restarts; changing it invalidates existing sessions.
- Clear the `ai_coding_agent_session` cookie and sign in again after credential rotation.

## Task Stuck Waiting for Plan Approval

This is expected until a user approves the plan. The runner must not edit files before this approval.

Actions:

- Review plan target files.
- Review risks.
- Approve or reject from the task detail view.

## Store Selection

Default local development uses `RUNNER_STORE_FILE=.runner-data/store.json`.

For SQLite persistence:

```bash
RUNNER_SQLITE_FILE=.runner-data/store.db pnpm --filter runner dev
```

For the Prisma relational schema:

```bash
DATABASE_URL=file:./.runner-data/dev.db pnpm --filter runner db:generate
DATABASE_URL=file:./.runner-data/dev.db pnpm --filter runner db:push
```

Actions:

- Keep `.runner-data/` out of git.
- Back up the SQLite file before manual schema experiments.
- Prefer a fresh database for integration tests that mutate tasks.

## Job Queue Mode

Use `RUNNER_JOB_MODE=queued` when task creation should return quickly and plan generation should be processed out of band.

```bash
RUNNER_JOB_MODE=queued RUNNER_JOB_WORKER_INTERVAL_MS=1000 RUNNER_JOB_WORKER_CONCURRENCY=1 pnpm --filter runner dev
```

Checks:

```bash
curl http://localhost:8787/api/jobs
curl -X POST http://localhost:8787/api/jobs/process-next
```

Actions:

- Confirm `POST /api/tasks` returns `202` with a `jobId`.
- Use the Web console Jobs page to inspect attempts, backoff, and terminal errors.
- Confirm task details include a `jobs` array with `PLAN_TASK`.
- Confirm runner logs show `Runner job worker started`.
- If jobs stay `QUEUED`, inspect `nextRunAt`. Future timestamps mean the job is waiting for retry backoff.
- If jobs stay `QUEUED` past `nextRunAt`, confirm the worker process is running, then call `/api/jobs/process-next` to process one job manually.
- If a job is `FAILED`, inspect `attempts`, `maxAttempts`, `error`, and the related task logs before retrying manually.
- Increase `RUNNER_JOB_WORKER_CONCURRENCY` only when the runner host can safely handle parallel task workspaces.

## Workspace Cleanup

The runner starts workspace cleanup by default. It removes only terminal task directories older than `RUNNER_WORKSPACE_RETENTION_HOURS`.

Checks:

```bash
curl -X POST -H "Authorization: Bearer $RUNNER_API_KEY" http://localhost:8787/api/workspaces/cleanup
```

Actions:

- Confirm `WORKSPACE_ROOT` points to a dedicated workspace volume.
- Set `RUNNER_WORKSPACE_CLEANUP=disabled` before manual filesystem investigations.
- Increase `RUNNER_WORKSPACE_RETENTION_HOURS` when debugging failed tasks requires longer local retention.
- Review the cleanup response `removed`, `skipped`, and `errors` arrays before deleting anything manually.

## Tests Failed

Actions:

- Read failed command and output.
- Compare the task trace with the run log to identify the last completed phase.
- Re-run the specific failing test when safe.
- Do not approve PR creation until failures are resolved or explicitly accepted.

## Workspace Execution Mode

Use `RUNNER_EXECUTION_MODE=workspace` only when the runner host has:

- Network access to GitHub.
- A writable `WORKSPACE_ROOT`.
- The target package manager available on `PATH`.
- Approval controls enabled for dependency install, push, and PR creation.

Checks:

```bash
curl http://localhost:8787/health
git --version
pnpm --version
```

Actions:

- Confirm each task creates a directory under `.workspaces/<task_id>/repo`.
- Confirm logs show `REPO_CLONING` before `CONTEXT_ANALYZING`.
- Confirm the task detail trace shows state transitions through `IMPLEMENTING`, `TESTING`, and any failure phase.
- If verification fails, inspect stored test output before retrying or approving PR creation.

## E2E Artifacts

When a task has an E2E command, the runner records a task artifact after the command finishes.

Configuration:

```bash
RUNNER_ARTIFACT_DIR=.runner-data/artifacts
```

Actions:

- Keep `RUNNER_ARTIFACT_DIR` on a durable volume when reports must survive deploys.
- Inspect `<artifact_dir>/<task_id>/e2e/playwright-report/index.html` for the copied Playwright report.
- Inspect `<artifact_dir>/<task_id>/e2e/screenshots/` for copied `test-results/**/*.png` screenshots.
- If artifact paths are present but files are missing, confirm Playwright generated `playwright-report/` and `test-results/` inside the task workspace before cleanup.

## PR Creation Failed

Checks:

- GitHub token exists and is scoped to the target repo.
- Branch was pushed successfully.
- Base branch exists.
- Approval exists for PR creation.
- In live PR mode, the branch publish commands passed before Octokit PR creation.

Actions:

- Inspect the `PR_CREATING` logs for the failed git command or GitHub API error.
- Confirm the workspace has a non-empty diff before retrying branch publish.
- Do not retry with broader GitHub permissions until the failing step is understood.

## Suspected Secret Leak

Actions:

- Rotate exposed token immediately.
- Search logs for the token fingerprint.
- Confirm redaction tests pass.
- Add a regression test for the leak pattern.
