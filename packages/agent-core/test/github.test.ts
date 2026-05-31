import { describe, expect, it } from "vitest";
import { parseGitHubIssueUrl, parseGitHubRepositoryUrl } from "../src/github";

describe("GitHub URL parsing", () => {
  it("parses repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/example/repo.git")).toEqual({
      owner: "example",
      name: "repo",
      url: "https://github.com/example/repo"
    });
  });

  it("parses issue URLs", () => {
    expect(parseGitHubIssueUrl("https://github.com/example/repo/issues/12")).toMatchObject({
      owner: "example",
      name: "repo",
      issueNumber: 12
    });
  });
});

