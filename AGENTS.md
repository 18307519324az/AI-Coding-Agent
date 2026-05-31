# AGENTS.md

## Project

This repository builds an AI Coding Agent:

- Web console for creating and monitoring coding tasks.
- Agent runner for cloning repositories, editing code, running tests, and creating PRs.
- Strong safety boundary around command execution and GitHub write actions.

## Working Agreements

- Use pnpm.
- Use TypeScript.
- Keep code modular and testable.
- Prefer small, reviewable commits.
- Do not add production dependencies without explaining why.
- Do not commit secrets.
- Do not hardcode tokens.
- All shell execution must go through the runner command allowlist.
- All GitHub write actions require user approval.
- All UI work should use the `de-ai-frontend` skill.

## Required Checks

Before finishing a coding task, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For UI changes, also run:

```bash
pnpm test:e2e
```

If a check cannot be run, explain why and provide the exact command the user should run.

## Frontend Style

- Avoid generic AI landing-page aesthetics.
- Build a practical SaaS console UI.
- Include loading, empty, error, disabled, and success states.
- Use specific product copy tied to agent workflows.
- Keep layout restrained, dense, and readable.

## Safety

- Never run destructive commands without explicit approval.
- Never push directly to main.
- Never expose environment variables in logs.
- Never upload repository content to third-party systems unless required and approved.

