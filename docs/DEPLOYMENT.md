# Deployment

The MVP is split into two deployable units:

- Web console.
- Runner service.

Do not deploy the runner as an unguarded command-executing process on a general web server.

## Web

Supported targets:

- Vercel.
- Cloudflare Pages with a compatible Next.js adapter.
- Self-hosted Node.

Required environment:

```bash
RUNNER_API_URL=https://runner.example.com
RUNNER_API_KEY=...
WEB_AUTH_USERNAME=admin
WEB_AUTH_PASSWORD=...
WEB_AUTH_SESSION_SECRET=...
```

Use `NEXT_PUBLIC_RUNNER_API_URL` only for unprotected local compatibility. Production Web builds should keep runner credentials server-side and use the built-in `/api/runner/*` proxy for browser-originating writes.
Set `WEB_AUTH_PASSWORD` for every publicly reachable Web deployment; otherwise the console intentionally runs without user login for local development.

## Runner

Recommended target:

- Isolated VM or container with a dedicated workspace volume.
- Restricted network egress where possible.
- Repository-scoped GitHub token.
- OpenAI API key with cost controls.

Required environment:

```bash
RUNNER_PORT=8787
RUNNER_HOST=0.0.0.0
WORKSPACE_ROOT=.workspaces
RUNNER_ARTIFACT_DIR=.runner-data/artifacts
GITHUB_TOKEN=...
OPENAI_API_KEY=...
RUNNER_API_KEY=...
DATABASE_URL=file:./dev.db
RUNNER_EXECUTION_MODE=workspace
RUNNER_JOB_MODE=queued
RUNNER_JOB_WORKER_INTERVAL_MS=1000
RUNNER_JOB_WORKER_CONCURRENCY=1
RUNNER_JOB_MAX_ATTEMPTS=3
RUNNER_JOB_RETRY_BACKOFF_MS=1000
RUNNER_WORKSPACE_RETENTION_HOURS=168
RUNNER_WORKSPACE_CLEANUP_INTERVAL_MS=3600000
RUNNER_WORKSPACE_CLEANUP=enabled
```

When `RUNNER_JOB_MODE=queued`, the runner process starts the queue worker after the API is listening. Keep `RUNNER_JOB_WORKER_CONCURRENCY=1` unless the host has enough isolated workspace capacity for parallel command execution. Failed jobs retry until `RUNNER_JOB_MAX_ATTEMPTS` is exhausted, with `RUNNER_JOB_RETRY_BACKOFF_MS` as the base delay.

When workspace cleanup is enabled, terminal task directories under `WORKSPACE_ROOT` are removed after the retention window. Mount `WORKSPACE_ROOT` on a dedicated volume so cleanup cannot affect unrelated application files.

Mount `RUNNER_ARTIFACT_DIR` on durable storage if Playwright reports and screenshots must survive runner restarts or redeploys.

## Deployment Checklist

- Secrets are stored in platform secret manager.
- `.env` files are not committed.
- Runner logs redact tokens.
- GitHub token is repository-scoped.
- Runner API key matches the Web service secret.
- Web auth password and session secret are configured for the console.
- Job worker concurrency and retry limits match runner host capacity.
- Workspace cleanup policy is enabled.
- E2E artifact storage is on the intended volume.
- CI passes before deploy.
- PR creation remains approval-gated.
- Runner API is authenticated before public exposure.
