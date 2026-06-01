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
NEXT_PUBLIC_RUNNER_API_URL=https://runner.example.com
```

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
GITHUB_TOKEN=...
OPENAI_API_KEY=...
DATABASE_URL=file:./dev.db
RUNNER_EXECUTION_MODE=workspace
RUNNER_JOB_MODE=queued
RUNNER_JOB_WORKER_INTERVAL_MS=1000
```

When `RUNNER_JOB_MODE=queued`, the runner process starts the queue worker after the API is listening. Run one worker per SQLite-backed runner instance until concurrency controls are added.

## Deployment Checklist

- Secrets are stored in platform secret manager.
- `.env` files are not committed.
- Runner logs redact tokens.
- GitHub token is repository-scoped.
- Workspace cleanup policy is enabled.
- CI passes before deploy.
- PR creation remains approval-gated.
- Runner API is authenticated before public exposure.
