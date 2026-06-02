import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardRunnerPost } from "./runner-proxy";

function stubRunnerFetch() {
  const calls: Array<{
    input: Parameters<typeof fetch>[0];
    init: Parameters<typeof fetch>[1];
  }> = [];
  const fetchMock = async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
    calls.push({
      input,
      init
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 202
    });
  };
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("forwardRunnerPost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an empty JSON body for POST requests without payloads", async () => {
    const fetchCalls = stubRunnerFetch();

    const response = await forwardRunnerPost(
      "/api/tasks/task_1/approvals/approval_1/approve",
      new Request("http://localhost/api/runner/approve", {
        method: "POST"
      })
    );

    const init = fetchCalls[0]?.init;
    const headers = new Headers(init?.headers);
    expect(response.status).toBe(202);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe("{}");
  });

  it("preserves the caller body and content type when present", async () => {
    const fetchCalls = stubRunnerFetch();

    await forwardRunnerPost(
      "/api/tasks/task_1/approvals/approval_1/reject",
      new Request("http://localhost/api/runner/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: "Please narrow the plan first."
        })
      })
    );

    const init = fetchCalls[0]?.init;
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({
      reason: "Please narrow the plan first."
    }));
  });
});
