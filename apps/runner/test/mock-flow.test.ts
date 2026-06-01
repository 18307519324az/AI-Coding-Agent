import { describe, expect, it } from "vitest";
import { approvePlanFlow, approvePrFlow, createTaskFlow } from "../src/mock-flow";
import { createStore, listTaskApprovals } from "../src/store";

describe("mock task flow", () => {
  it("uses the live GitHub PR creator only when live mode is enabled", async () => {
    const previousMode = process.env.GITHUB_PR_MODE;
    process.env.GITHUB_PR_MODE = "live";
    try {
      const store = createStore();
      const task = await createTaskFlow(store, {
        repositoryUrl: "https://github.com/acme/customer-portal",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      });
      const readyForPr = await approvePlanFlow(store, task);
      const approval = listTaskApprovals(store, readyForPr.id).find((item) => item.type === "CREATE_PR");
      const seenInputs: unknown[] = [];

      const completed = await approvePrFlow(store, readyForPr, approval, async (input) => {
        seenInputs.push(input);
        return "https://github.com/acme/customer-portal/pull/7";
      });

      expect(completed).toMatchObject({
        status: "COMPLETED",
        prUrl: "https://github.com/acme/customer-portal/pull/7"
      });
      expect(seenInputs).toEqual([
        expect.objectContaining({
          owner: "acme",
          repo: "customer-portal",
          title: "Fix login button",
          head: readyForPr.branchName,
          base: "main",
          draft: true
        })
      ]);
    } finally {
      if (previousMode === undefined) {
        delete process.env.GITHUB_PR_MODE;
      } else {
        process.env.GITHUB_PR_MODE = previousMode;
      }
    }
  });
});
