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
| System can create GitHub PR | Done | `pnpm smoke:live-pr` created draft PR https://github.com/18307519324az/AI-Coding-Agent/pull/1 from branch `agent/live-pr-smoke/live-pr-smoke-20260602t015217z`; evidence is recorded in `docs/verification/live-github-smoke/latest.md`. |
| All high-risk actions require approval | Done | Command policy tests for install/push/destructive commands; PR approval gate tests. |
| Logs do not leak tokens | Done | Redaction helpers and tests; PR creation failure redaction regression in `apps/runner/test/mock-flow.test.ts`. |
| UI passes de-AI style check | Done | `docs/UI_REVIEW.md` records the 2026-06-02 visual review with screenshots for desktop/mobile dashboard, task detail, jobs, settings, and create-task error state. |
| CI passes | Done | `pnpm run ci` passed locally before this matrix update; GitHub Actions workflow exists at `.github/workflows/ci.yml`. |

## v1 Completion Definition

| PRD item | Status | Current evidence |
| --- | --- | --- |
| Web console works normally | Done | Dashboard, repositories, jobs, task creation, task detail, settings, and login are implemented and E2E-covered. |
| Runner can execute tasks stably | Done | Inline and queued runner modes, retry/backoff, single-host worker file leasing, workspace cleanup, persistence, and metrics are implemented and tested. |
| Supports GitHub Issue to PR | Done | `pnpm smoke:live-issue-pr` read GitHub issue https://github.com/18307519324az/AI-Coding-Agent/issues/2 and created draft PR https://github.com/18307519324az/AI-Coding-Agent/pull/3; evidence is recorded in `docs/verification/live-github-smoke/latest.md`. |
| Supports human approval | Done | Plan and PR approvals are first-class API/store/UI concepts. |
| Supports tests and E2E verification | Done | Unit verification and E2E artifact capture are implemented; Playwright E2E passes in CI. |
| Supports Agent self-review report | Done | `createSelfReview` and PR body generation are used before PR approval. |
| Supports logs and trace | Done | Logs and trace events are persisted and displayed in task detail. |
| Supports safe command policy | Done | Allowlist, approval-gated high-risk commands, workspace boundary checks, `.env` guard, and redaction tests exist. |
| Supports at least 5 eval cases | Done | Six eval cases exist; two run fixture-backed runner flow evals. |
| UI reaches real SaaS product quality | Done | Visual review artifacts in `docs/ui-review/2026-06-02/` cover operational navigation, metrics, task queue, approvals, logs, traces, diffs, tests, jobs, settings, error state, and mobile dashboard. |
| README lets a new user run within 10 minutes | Done | Quick Start includes `corepack enable`, `pnpm install`, `pnpm run doctor`, and `pnpm dev`; `.env.example` documents local mock defaults and integration credentials. |
| CI passes | Done | Local full CI passed before this matrix update. |
| First-release storage and queue backend selected | Done | `docs/RELEASE_DECISIONS.md` scopes first release to single-host durable JSON/SQLite snapshot storage with same-host worker file leasing; PostgreSQL/Redis/BullMQ are follow-up scale milestones. |
| At least one real test repository PR created successfully | Done | Live smoke created two real draft PRs in the test repository: https://github.com/18307519324az/AI-Coding-Agent/pull/1 and https://github.com/18307519324az/AI-Coding-Agent/pull/3. |

## Remaining Release Gates

No first-release PRD gates remain open in this matrix. For future multi-host deployments, use a database or queue backend before distributing workers across multiple hosts.
