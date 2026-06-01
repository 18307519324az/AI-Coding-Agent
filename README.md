# AI Coding Agent

AI Coding Agent is a developer-focused automation console for turning GitHub issues, bug reports, and feature requests into reviewed, tested Pull Request drafts.

The repository is a pnpm TypeScript monorepo with:

- `apps/web`: Next.js Web console with realistic task, approval, log, diff, test, and PR states.
- `apps/runner`: Fastify Agent Runner API with in-memory MVP storage and guarded command execution primitives.
- `packages/shared`: Zod schemas and shared domain types.
- `packages/agent-core`: state machine, command allowlist, log redaction, GitHub URL parsing, plan output, and PR summary helpers.
- `.agents/skills`: repository-level Codex skills matching the PRD workflows.

## Quick Start

```bash
corepack enable
pnpm install
pnpm dev
```

Open the Web console at `http://localhost:3000`.

The runner starts at `http://localhost:8787`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

For CI parity:

```bash
pnpm ci
```

## Environment

Create local env files from examples when adding real integrations. Do not commit secrets.

Runner variables:

```bash
GITHUB_TOKEN=...
OPENAI_API_KEY=...
WORKSPACE_ROOT=.workspaces
RUNNER_STORE_FILE=.runner-data/store.json
RUNNER_PORT=8787
```

## Safety Model

The runner treats shell execution as a policy decision, not a free-form chat action.

- Read-only commands are allowed without approval.
- Dependency install, push, PR creation, workflow trigger, and destructive operations require explicit approval or are blocked.
- Logs are redacted before storage.
- GitHub write operations must be approved before execution.
- Tasks use isolated workspace directories under `.workspaces/`.

## MVP Flow

1. User creates an Agent Task from a repository URL, issue URL, or prompt.
2. Runner records the task and generates a structured plan.
3. User approves or rejects the plan.
4. Runner executes guarded steps, records logs, stores diff and test results.
5. Runner produces a self-review.
6. User approves PR creation.
7. Runner creates or simulates the PR and records the PR URL.

The current implementation includes a complete mock/in-memory flow suitable for product iteration, unit tests, and UI verification. Real OpenAI model execution and persistent job storage are isolated behind the runner and agent-core boundaries so they can be added without changing the Web console contract.
