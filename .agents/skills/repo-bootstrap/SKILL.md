---
name: repo-bootstrap
description: Initialize or repair the AI-Coding-Agent pnpm TypeScript monorepo structure, CI, docs, and base package scripts.
---

# Repo Bootstrap

Use when creating or repairing repository structure.

Checklist:

1. Read `AGENTS.md` and `docs/PRD.md`.
2. Preserve pnpm workspace layout.
3. Keep `apps/web`, `apps/runner`, `packages/shared`, and `packages/agent-core`.
4. Add or update `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/TESTING.md`.
5. Keep CI running lint, typecheck, unit tests, and E2E.
6. Do not add secrets or personal config.

Before finishing:

- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Run `pnpm test`.

