import { expect, test } from "@playwright/test";

test("dashboard shows task queue and approval state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New agent task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Tasks" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
});

test("create task form exposes loading, error, disabled, and success states", async ({ page }) => {
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
  await page.goto("/tasks/task_login");

  await expect(page.getByRole("heading", { name: "Fix login button click handling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution Plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diff Preview" })).toBeVisible();
  await expect(page.getByText("Playwright smoke checks passed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve PR" })).toBeVisible();
});

test("repository form saves through the runner", async ({ page }) => {
  await page.goto("/repositories/new");

  await page.getByLabel("GitHub repository URL").fill("https://github.com/acme/agent-fixture");
  await page.getByLabel("Default branch").fill("main");
  await page.getByRole("button", { name: "Save repository" }).click();

  await expect(page.getByRole("button", { name: "Saving repository..." })).toBeDisabled();
  await expect(page.getByText("Repository connection saved for task creation.")).toBeVisible();
});
