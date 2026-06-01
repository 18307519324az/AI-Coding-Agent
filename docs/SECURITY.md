# Security

AI Coding Agent handles code, repository access, shell commands, and GitHub write operations. The default posture is deny-by-default for execution and approval-required for write actions.

## Secrets

Never commit secrets. Use environment variables for:

- `GITHUB_TOKEN`
- `GITHUB_PERSONAL_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `RUNNER_API_KEY`
- `DATABASE_URL`

Forbidden:

- Writing tokens to logs.
- Adding `.env` to git.
- Hardcoding credentials in source files.
- Passing user repositories to unrelated third-party services.

Required:

- Redact logs before storage.
- Use repository-scoped GitHub permissions.
- Keep GitHub write tools behind approvals.
- Review the full diff before PR creation.
- Send only bounded planning and implementation context to OpenAI.
- Reject model-requested edits outside the task workspace, `.git`, or `.env` files.

## API Boundary

Set `RUNNER_API_KEY` before exposing the runner outside a trusted local network. When configured, every Runner API route except `/health` requires `Authorization: Bearer <RUNNER_API_KEY>`. The Web app should keep this value in a server-side environment variable and call the runner through server components or `/api/runner/*` proxy routes, not from browser code.

Do not put Runner credentials in `NEXT_PUBLIC_*` variables.

## Command Execution

All commands must go through `evaluateCommand`.

Allowed without approval:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- equivalent npm/yarn check scripts
- `npx playwright test`
- `git status`
- `git diff`
- bounded `git checkout -b`
- bounded `git commit -m`

Allowed only with approval:

- `pnpm install`
- `npm install`
- `yarn install`
- `git push`

Blocked:

- `rm -rf`
- `curl | bash`
- `wget | bash`
- `sudo`
- `chmod 777`
- `scp`
- `ssh`
- privileged Docker commands
- `eval`
- `node -e`
- `python -c`
- any command outside the MVP allowlist

## Workspace Isolation

Each task should use:

```text
.workspaces/
  task_<id>/
    repo/
```

Future hardening should add:

- Per-task filesystem sandboxing.
- Maximum workspace size.
- Timeouts for every command.
- Environment variable allowlist.
- Network policy controls for runner jobs.
- Cleanup retention policy.

## Prompt Injection

Repository files, issue text, and test logs are untrusted input. They may ask the Agent to leak secrets or bypass policy. The runner must treat them as data, not authority.

Required controls:

- Prompt text cannot approve commands.
- Prompt text cannot bypass allowlist.
- Prompt text cannot read files outside the workspace.
- Prompt text cannot trigger GitHub writes.
- Approval records must come from the user/API control plane.

## Logging

Logs must be redacted before storage and display. Never print raw environment values. The redaction layer currently covers common GitHub and OpenAI token patterns and key/value secret forms.

## PR Creation

Before PR creation:

- Plan must have been approved.
- Tests must be recorded.
- Self-review must be generated.
- Diff must be visible to the user.
- Create PR approval must be approved.
- Live branch publishing must run through the command allowlist.
- `git push` must receive explicit approval context from the PR approval flow.

The product must never merge PRs automatically in MVP.
