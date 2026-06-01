# Release Decisions

This file records product-scope decisions that affect whether the current implementation satisfies the PRD for the first releasable version.

## Store and Queue Backend

Decision: the first release is scoped to a single runner host with durable local storage. The supported release store is the runner's JSON file store for local development or the SQLite snapshot store for staging and self-hosted use. Full Prisma runtime repositories, PostgreSQL, Redis, and BullMQ are not first-release blockers.

Rationale:

- The PRD completion definition requires a usable Web console, stable runner execution, human approval, tests, logs, trace, evals, CI, and a real PR proof. It does not require horizontal scaling.
- `RUNNER_SQLITE_FILE` / `DATABASE_URL=file:...` persists tasks, approvals, trace events, logs, diffs, tests, E2E artifact metadata, repositories, and runner jobs across runner restarts.
- Queued mode has retry/backoff, metrics, a jobs console, manual `/api/jobs/process-next`, and a same-host worker file lease so multiple runner processes sharing the same storage path do not drain the queue concurrently.
- The Prisma schema remains useful as the relational target shape, but replacing the runtime store with Prisma repositories would add migration and operational surface without closing the remaining user-visible release gates.

Operational boundary:

- Use one runner host, or multiple same-host runner processes that share the same durable `.runner-data` volume and `RUNNER_JOB_WORKER_LOCK_FILE`.
- Do not distribute queue workers across multiple hosts with the current store.
- Before multi-host deployment, move queue claiming and persistence to a database or queue backend with transactional leases, then re-run the live PR and issue-to-PR smoke checks.

Follow-up milestone:

- Add Prisma/PostgreSQL repositories and Redis/BullMQ workers when the product needs horizontal runner scaling, centralized reporting, or team-scale operations.
