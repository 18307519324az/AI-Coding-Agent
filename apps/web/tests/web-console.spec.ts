import { expect, test, type Page } from "@playwright/test";

async function delayRunnerPost(page: Page, path: string): Promise<void> {
  await page.route(path, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.continue();
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("operator");
  await page.getByLabel("Password").fill("test-web-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("requires web console login before protected pages and APIs", async ({ page }) => {
  const apiResponse = await page.request.post("/api/runner/tasks", { data: {} });
  expect(apiResponse.status()).toBe(401);

  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);

  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  await page.getByLabel("Password").fill("test-web-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
});

test("dashboard shows task queue and approval state", async ({ page }) => {
  await signIn(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New agent task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Tasks" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
});

test("jobs page shows retry attempts and backoff state", async ({ page }) => {
  await signIn(page);
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "Runner Jobs" })).toBeVisible();
  const retryRow = page.getByRole("row", { name: /job_plan_allowlist/ });
  await expect(retryRow).toBeVisible();
  await expect(retryRow.getByText("1 / 3")).toBeVisible();
  await expect(retryRow.getByText("Temporary model timeout.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Implement command allowlist" })).toBeVisible();
});

test("settings page shows runner metrics", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Runner metrics")).toBeVisible();
  await expect(page.getByText("Runner uptime")).toBeVisible();
  await expect(page.getByText("Pending approvals")).toBeVisible();
});

test("create task form exposes loading, error, disabled, and success states", async ({ page }) => {
  await signIn(page);
  await delayRunnerPost(page, "**/api/runner/tasks");
  await page.goto("/tasks/new");

  await expect(page.getByLabel("Repository URL")).toBeVisible();
  await page.getByRole("button", { name: "Simulate error state" }).click();
  await expect(page.getByText("Runner offline")).toBeVisible();

  await page.getByLabel("Repository URL").fill("https://github.com/acme/customer-portal");
  await page.getByLabel("Task title").fill("Fix login button");
  await page.getByLabel("Task prompt").fill("The login button does not respond when clicked.");

  await page.getByRole("button", { name: "Create agent task" }).click();
  await expect(page.getByRole("button", { name: "Creating task..." })).toBeDisabled();
  await expect(page.getByText("Task accepted. Plan generation is queued", { exact: false })).toBeVisible();
});

test("task detail shows plan, diff, logs, tests, and approval controls", async ({ page }) => {
  await signIn(page);
  await page.goto("/tasks/task_login");

  await expect(page.getByRole("heading", { name: "Fix login button click handling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution Plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project Context" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution Trace" })).toBeVisible();
  await expect(page.getByText("WAITING_FOR_PR_APPROVAL").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diff Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Report" })).toBeVisible();
  await expect(page.getByText("playwright-report/index.html")).toBeVisible();
  await expect(page.getByText("pnpm test:e2e login.spec.ts").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve PR" })).toBeVisible();
});

test("task detail approval controls execute runner approval flow", async ({ page }) => {
  await signIn(page);
  const approvalRequests: Array<{ contentType?: string; postData: string | null }> = [];
  await page.route("**/api/runner/tasks/*/approvals/*/approve", async (route) => {
    const request = route.request();
    approvalRequests.push({
      contentType: request.headers()["content-type"],
      postData: request.postData()
    });
    await route.continue();
  });
  await page.goto("/tasks/new");

  await page.getByLabel("Repository URL").fill("https://github.com/acme/approval-flow");
  await page.getByLabel("Task title").fill("Fix approval handoff");
  await page.getByLabel("Task prompt").fill("The save button should stay disabled while the request is running.");
  await page.getByRole("button", { name: "Create agent task" }).click();
  await page.getByRole("link", { name: "Open task detail" }).click();

  await expect(page.getByRole("button", { name: "Approve plan and start implementation" })).toBeVisible();
  await page.getByRole("button", { name: "Approve plan and start implementation" }).click();
  await expect(page.getByText("PLAN approved. Refreshing task state.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve PR" })).toBeVisible();
  expect(approvalRequests[0]).toMatchObject({
    contentType: "application/json",
    postData: "{}"
  });

  await page.getByRole("button", { name: "Approve PR" }).click();
  await expect(page.getByText("CREATE PR approved. Refreshing task state.")).toBeVisible();
  await expect(page.locator("header").getByText("COMPLETED")).toBeVisible();
  expect(approvalRequests).toHaveLength(2);
  expect(approvalRequests.map((request) => request.postData)).toEqual(["{}", "{}"]);
  expect(approvalRequests.every((request) => request.contentType === "application/json")).toBe(true);
});

test("repository form saves through the runner", async ({ page }) => {
  await signIn(page);
  await delayRunnerPost(page, "**/api/runner/repositories");
  await page.goto("/repositories/new");

  await page.getByLabel("GitHub repository URL").fill("https://github.com/acme/agent-fixture");
  await page.getByLabel("Default branch").fill("main");
  await page.getByRole("button", { name: "Save repository" }).click();

  await expect(page.getByRole("button", { name: "Saving repository..." })).toBeDisabled();
  await expect(page.getByText("Repository connection saved for task creation.")).toBeVisible();
});
