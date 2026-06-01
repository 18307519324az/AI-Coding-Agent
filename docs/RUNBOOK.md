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
- Confirm workspace directory is writable.
- Confirm secrets are present only in environment variables.

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
RUNNER_JOB_MODE=queued pnpm --filter runner dev
```

Checks:

```bash
curl http://localhost:8787/api/jobs
curl -X POST http://localhost:8787/api/jobs/process-next
```

Actions:

- Confirm `POST /api/tasks` returns `202` with a `jobId`.
- Confirm task details include a `jobs` array with `PLAN_TASK`.
- If jobs stay `QUEUED`, call `/api/jobs/process-next` or check the future worker process.
- If a job is `FAILED`, inspect its `error` and the related task logs before retrying manually.

## Tests Failed

Actions:

- Read failed command and output.
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
- If verification fails, inspect stored test output before retrying or approving PR creation.

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
