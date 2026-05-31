---
name: failing-test-repair
description: Analyze failing test logs, identify likely source files, patch behavior, and rerun the failing test without masking business bugs.
---

# Failing Test Repair

Workflow:

1. Read the failing command and output.
2. Identify the smallest relevant source and test files.
3. Reproduce with the specific failing test command when possible.
4. Patch business behavior before changing tests.
5. Only update tests when expected behavior is explicitly wrong or missing.
6. Rerun the failing test and then broader checks.

Report:

- Root cause.
- Changed files.
- Tests run.
- Remaining risk.

