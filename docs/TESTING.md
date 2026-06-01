# Testing

The project uses layered tests so Agent behavior, runner safety, and Web UI flows can be checked independently.

## Commands

```bash
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
- Create task flow.
- Plan approval waiting state.
- Queued plan generation and job failure recording.
- Background job worker interval, stop, error, and non-overlap behavior.
- GitHub issue URL task intake.
- Workspace project analysis.
- OpenAI model adapter response validation.
- Model-generated implementation file application.
- Git branch publishing guardrails.
- Store persistence, including SQLite snapshot storage.
- Workspace cleanup retention, terminal-state filtering, and non-overlap behavior.
- Log redaction expectations.

Next runner tests should cover:

- Command executor refuses commands outside policy.
- Job retry and backoff behavior once retries are added.

## E2E Tests

Covered in `apps/web/tests` with Playwright:

- Dashboard task queue and approval state.
- Create Task page loading, error, disabled, and success states through the server-side Runner proxy.
- Task detail plan, diff, logs, tests, and approval controls.
- Task detail approve-plan and approve-PR actions through the server-side Runner proxy.
- Repository form save flow against a Runner started with API key auth in test setup.

## Agent Eval

The `evals/cases` directory contains JSON cases for:

- Simple TypeScript fix.
- Add unit test.
- Improve UI and remove generic AI style.
- Reject dangerous command.
- Failing test repair.

The current `evals/runner.ts` validates case structure, fixture availability, expected file path boundaries, required command allowlist status, and forbidden command blocking. The fixtures under `evals/fixtures` are treated as eval data rather than compiled workspace source.

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
