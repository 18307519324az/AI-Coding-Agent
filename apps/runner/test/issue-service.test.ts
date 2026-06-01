import { describe, expect, it } from "vitest";
import { resolveCreateTaskRequest } from "../src/issue-service";

describe("resolveCreateTaskRequest", () => {
  it("uses explicit title and prompt without fetching the issue", async () => {
    let fetched = false;
    const request = await resolveCreateTaskRequest(
      {
        repositoryUrl: "https://github.com/acme/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        issueUrl: "https://github.com/acme/repo/issues/12",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      },
      async () => {
        fetched = true;
        throw new Error("Issue fetch should not be called.");
      }
    );

    expect(fetched).toBe(false);
    expect(request.title).toBe("Fix login button");
    expect(request.prompt).toBe("The login button does not respond when clicked.");
  });

  it("hydrates missing title and prompt from a GitHub issue", async () => {
    const request = await resolveCreateTaskRequest(
      {
        repositoryUrl: "https://github.com/acme/repo",
        issueUrl: "https://github.com/acme/repo/issues/12",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      },
      async () => ({
        title: "Fix issue-driven login failure",
        body: "Clicking sign in leaves the form idle.",
        issueNumber: 12,
        url: "https://github.com/acme/repo/issues/12",
        repositoryUrl: "https://github.com/acme/repo"
      })
    );

    expect(request.title).toBe("Fix issue-driven login failure");
    expect(request.prompt).toContain("GitHub issue #12");
    expect(request.prompt).toContain("Clicking sign in leaves the form idle.");
  });
});
