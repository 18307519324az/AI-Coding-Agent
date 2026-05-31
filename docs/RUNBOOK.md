# Operations Runbook

## Runner Offline

Symptoms:

- Web console shows runner offline.
- New task creation fails.
- Logs stop updating.

Checks:

```bash
curl http://localhost:8787/health
pnpm --filter runner dev
```

Actions:

- Confirm `RUNNER_PORT`.
- Check process logs.
- Confirm workspace directory is writable.
- Confirm secrets are present only in environment variables.

## Task Stuck Waiting for Plan Approval

This is expected until a user approves the plan. The runner must not edit files before this approval.

Actions:

- Review plan target files.
- Review risks.
- Approve or reject from the task detail view.

## Tests Failed

Actions:

- Read failed command and output.
- Re-run the specific failing test when safe.
- Do not approve PR creation until failures are resolved or explicitly accepted.

## PR Creation Failed

Checks:

- GitHub token exists and is scoped to the target repo.
- Branch was pushed successfully.
- Base branch exists.
- Approval exists for PR creation.

## Suspected Secret Leak

Actions:

- Rotate exposed token immediately.
- Search logs for the token fingerprint.
- Confirm redaction tests pass.
- Add a regression test for the leak pattern.

