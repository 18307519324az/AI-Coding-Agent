# PRD Coverage Matrix

This matrix tracks implementation evidence against `docs/PRD.md`. It is an audit aid, not a substitute for rerunning CI and smoke checks before release.

Status legend:

- `Done`: implemented and covered by code, tests, or docs in this repository.
- `Partial`: implemented for the MVP path, but not yet complete for the broader v1 target.
- `Unverified`: code or harness exists, but the required external proof has not been produced.

## MVP Acceptance

| PRD item | Status | Current evidence |
| --- | --- | --- |
| User can create an Agent Task | Done | `POST /api/tasks` in `apps/runner/src/server.ts`; Web create task flow in `apps/web/components/create-task-form.tsx`; Playwright create task test. |
| Agent can clone a GitHub repository | Done | Workspace clone path in `apps/runner/src/workspace.ts`; workspace execution tests in `apps/runner/test/server.test.ts`. |
| Agent can analyze code and generate a plan | Done | `analyzeProject` and plan generation in `apps/runner/src/project-analyzer.ts`, `apps/runner/src/model-service.ts`; model adapter tests. |
| User can approve or reject a plan | Done | Approval API routes in `apps/runner/src/server.ts`; Web approval panel; E2E approval flow. |
| Agent can modify code | Done | Bounded implementation application in `apps/runner/src/implementation-service.ts`; fixture flow evals apply edits. |
| Agent can run lint/typecheck/test | Done | Workspace verification command path in `approvePlanFlow`; command policy and runner tests; fixture flow evals assert required commands. |
| Task detail page shows status, logs, diff, and tests | Done | `apps/web/app/tasks/[id]/page.tsx`; E2E detail tests. |
| User can approve PR creation | Done | `CREATE_PR` approval type and Web approval flow; E2E approve-PR action. |
| System can create GitHub PR | Unverified | Live mode code exists in `approvePrFlow`, `git-publisher.ts`, and `github-service.ts`; `pnpm smoke:live-pr` and `pnpm smoke:live-issue-pr` harnesses exist but have not been run against a real test repo in this audit. |
| All high-risk actions require approval | Done | Command policy tests for install/push/destructive commands; PR approval gate tests. |
| Logs do not leak tokens | Done | Redaction helpers and tests; PR creation failure redaction regression in `apps/runner/test/mock-flow.test.ts`. |
| UI passes de-AI style check | Partial | UI uses restrained SaaS console pages and E2E state coverage; final human visual review remains manual. |
| CI passes | Done | `pnpm run ci` passed locally before this matrix update; GitHub Actions workflow exists at `.github/workflows/ci.yml`. |

## v1 Completion Definition

| PRD item | Status | Current evidence |
| --- | --- | --- |
| Web console works normally | Done | Dashboard, repositories, jobs, task creation, task detail, settings, and login are implemented and E2E-covered. |
| Runner can execute tasks stably | Done | Inline and queued runner modes, retry/backoff, single-host worker file leasing, workspace cleanup, persistence, and metrics are implemented and tested. |
| Supports GitHub Issue to PR | Unverified | Issue intake, live PR code, and `pnpm smoke:live-issue-pr` exist; full real issue-to-live-PR run is not yet proven against a real test repo. |
| Supports human approval | Done | Plan and PR approvals are first-class API/store/UI concepts. |
| Supports tests and E2E verification | Done | Unit verification and E2E artifact capture are implemented; Playwright E2E passes in CI. |
| Supports Agent self-review report | Done | `createSelfReview` and PR body generation are used before PR approval. |
| Supports logs and trace | Done | Logs and trace events are persisted and displayed in task detail. |
| Supports safe command policy | Done | Allowlist, approval-gated high-risk commands, workspace boundary checks, `.env` guard, and redaction tests exist. |
| Supports at least 5 eval cases | Done | Six eval cases exist; two run fixture-backed runner flow evals. |
| UI reaches real SaaS product quality | Partial | Current UI avoids a generic landing page and includes product state density; final release still needs manual UX review. |
| README lets a new user run within 10 minutes | Done | Quick Start includes `corepack enable`, `pnpm install`, `pnpm run doctor`, and `pnpm dev`; `.env.example` documents local mock defaults and integration credentials. |
| CI passes | Done | Local full CI passed before this matrix update. |
| At least one real test repository PR created successfully | Unverified | `pnpm smoke:live-pr` and `pnpm smoke:live-issue-pr` are repeatable harnesses for this proof; a real run and PR URL still need to be recorded. |

## Remaining Release Gates

1. Run `pnpm smoke:live-pr` and `pnpm smoke:live-issue-pr` against a disposable GitHub test repository using repository-scoped credentials, then record the PR URLs in release notes or verification artifacts.
2. Perform a manual UI review for the de-AI checklist after the final feature set is frozen.
3. Decide whether v1 requires Prisma/PostgreSQL runtime repositories or whether the current JSON/SQLite snapshot store is acceptable for the first release.
4. Use the shared worker lock path for same-host multi-process deployments; use a database or queue backend before distributing workers across multiple hosts.
