---
name: playwright-e2e-verification
description: Add or run Playwright checks for UI flows, screenshots, accessibility structure, and regression coverage.
---

# Playwright E2E Verification

Use for UI behavior and page-level verification.

Checklist:

- Prefer stable role-based selectors.
- Cover the user path, not implementation details.
- Verify loading, error, disabled, empty, and success states when touched.
- Keep tests deterministic.
- Add screenshots only when they aid diagnosis.

Commands:

```bash
pnpm --filter web test:e2e
pnpm --filter web exec playwright test --ui
```

