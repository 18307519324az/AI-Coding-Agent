# Testing

The project uses layered tests so Agent behavior, runner safety, and Web UI flows can be checked independently.

## Commands

```bash
pnpm run doctor
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web exec playwright install --with-deps chromium
pnpm test:e2e
```

## Unit Tests

Covered in `packages/agent-core/test`:

- Reject dangerous commands.
- Require approval for dependency install.
- Require approval for push.
- Allow safe checks.
- Enforce state transitions.
- Map failures to failure states.
- Redact secrets from logs.
- Parse GitHub repository and issue URLs.

## Runner Tests

Covered in `apps/runner/test`:

- API key protection for Runner API routes while keeping `/health` public.
- Runner metrics for tasks, jobs, approvals, logs, and traces.
- Create task flow.
- Plan approval waiting state.
- Task trace persistence and state-transition exposure in task detail responses.
- Queued plan generation, job retry/backoff, and terminal failure recording.
- Background job worker interval, stop, error, non-overlap, and concurrency behavior.
- GitHub issue URL task intake.
- Workspace project analysis.
- OpenAI model adapter response validation.
- Model-generated implementation file application.
- E2E artifact copying for Playwright reports and `test-results` screenshots.
- Git branch publishing guardrails.
- Command executor workspace boundary, `.env` guard, and sensitive environment filtering.
- Store persistence, including SQLite snapshot storage.
- Workspace cleanup retention, terminal-state filtering, and non-overlap behavior.
- Log redaction expectations.

Next runner tests should cover:

- Database or queue-backed claim leasing before distributing workers across multiple hosts.

## E2E Tests

Covered in `apps/web/tests` with Playwright:

- Dashboard task queue and approval state.
- Web console login, invalid credential handling, and protected API rejection.
- Runner Jobs page retry attempt and backoff display.
- Settings page runner metrics display.
- Create Task page loading, error, disabled, and success states through the server-side Runner proxy.
- Task detail plan, diff, logs, tests, and approval controls.
- Task detail execution trace.
- Task detail E2E report and screenshot artifact display.
- Task detail approve-plan and approve-PR actions through the server-side Runner proxy.
- Repository form save flow against a Runner started with API key auth in test setup.

## Agent Eval

The `evals/cases` directory contains JSON cases for:

- Simple TypeScript fix.
- Add unit test.
- Improve UI and remove generic AI style.
- Reject dangerous command.
- Failing test repair.
- PR summary generation.

The current `evals/runner.ts` validates case structure, fixture availability, expected file path boundaries, required command allowlist status, forbidden command blocking, and PR summary body requirements. Cases can also define `flowEval`; those cases copy the fixture into an isolated temporary workspace, run the Runner task flow through plan approval, apply the fixture implementation output, confirm the expected diff, record verification commands, and require a pending PR approval gate. The fixtures under `evals/fixtures` are treated as eval data rather than compiled workspace source.

## Live PR Smoke

`pnpm smoke:live-pr` exercises the real Runner path for plan approval, workspace edit, verification command execution, branch publish, and GitHub draft PR creation. It is intentionally excluded from CI because it creates a real branch and Pull Request.

Required environment:

```bash
LIVE_PR_SMOKE_CONFIRM=create-draft-pr
LIVE_PR_SMOKE_REPOSITORY_URL=https://github.com/example/test-repo
GITHUB_TOKEN=...
```

Optional environment:

```bash
LIVE_PR_SMOKE_BASE_BRANCH=main
LIVE_PR_SMOKE_ALLOW_INSTALL=1
LIVE_PR_SMOKE_TEST_COMMAND="npm test"
LIVE_PR_SMOKE_REQUIRE_TESTS=1
LIVE_PR_SMOKE_RESULT_FILE=.runner-data/live-pr-smoke-result.json
```

Use only a disposable test repository. The harness rejects repository URLs that contain credentials, redacts errors before printing, fails by default if no repository verification command runs, and can save a JSON result artifact containing the PR URL, branch, marker path, and test command statuses.

## Live Issue-to-PR Smoke

`pnpm smoke:live-issue-pr` exercises GitHub issue intake plus the same live PR path. It fetches the issue, hydrates the task title and prompt from the issue content, applies a bounded marker file, runs verification, publishes a branch, and creates a draft PR.

Required environment:

```bash
LIVE_ISSUE_PR_SMOKE_CONFIRM=create-draft-pr
LIVE_ISSUE_PR_SMOKE_ISSUE_URL=https://github.com/example/test-repo/issues/1
GITHUB_TOKEN=...
```

Optional environment:

```bash
LIVE_ISSUE_PR_SMOKE_BASE_BRANCH=main
LIVE_ISSUE_PR_SMOKE_ALLOW_INSTALL=1
LIVE_ISSUE_PR_SMOKE_TEST_COMMAND="npm test"
LIVE_ISSUE_PR_SMOKE_REQUIRE_TESTS=1
LIVE_ISSUE_PR_SMOKE_RESULT_FILE=.runner-data/live-issue-pr-smoke-result.json
```

Use only a disposable issue in a disposable test repository. The harness rejects credentialed issue URLs and can save a redacted JSON result artifact with the issue URL, PR URL, branch, marker path, and verification command statuses.

## Manual UI Review

Every front-end change should be checked for:

- Specific product copy.
- No generic hero page.
- No decorative gradients as the main surface.
- Loading, empty, error, disabled, and success states.
- Clear next action for approvals.
- Tables, timelines, logs, diffs, and test results where useful.
- Desktop-first console usability.
- Mobile readability.
