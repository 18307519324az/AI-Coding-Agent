"use client";

import { useState } from "react";

const runnerBaseUrl = process.env.NEXT_PUBLIC_RUNNER_API_URL ?? "http://127.0.0.1:8787";

export function CreateTaskForm() {
  const [submitting, setSubmitting] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="form panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setCreatedTaskId("");
        setSubmitting(true);

        const form = new FormData(event.currentTarget);
        try {
          const response = await fetch(`${runnerBaseUrl}/api/tasks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              repositoryUrl: form.get("repositoryUrl"),
              issueUrl: form.get("issueUrl") || undefined,
              title: form.get("title"),
              prompt: form.get("prompt"),
              branchPrefix: form.get("branchPrefix") || "agent",
              testCommandOverride: form.get("testCommand") || undefined,
              allowDependencyInstall: form.get("allowInstall") === "on",
              allowCreatePr: form.get("allowPr") === "on"
            })
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
            throw new Error(body?.error ?? "Runner rejected the task request.");
          }

          const body = (await response.json()) as { taskId: string };
          setCreatedTaskId(body.taskId);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Runner offline. Try again after it restarts.");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="repositoryUrl">Repository URL</label>
        <input
          id="repositoryUrl"
          name="repositoryUrl"
          placeholder="https://github.com/acme/customer-portal"
          required
          type="url"
        />
        <span className="help">GitHub repository to clone into an isolated task workspace.</span>
      </div>

      <div className="field">
        <label htmlFor="issueUrl">Issue URL</label>
        <input
          id="issueUrl"
          name="issueUrl"
          placeholder="https://github.com/acme/customer-portal/issues/12"
          type="url"
        />
        <span className="help">Optional. The runner reads this as the task source of truth.</span>
      </div>

      <div className="field">
        <label htmlFor="title">Task title</label>
        <input id="title" name="title" placeholder="Fix login button click handling" required />
      </div>

      <div className="field">
        <label htmlFor="prompt">Task prompt</label>
        <textarea
          id="prompt"
          name="prompt"
          placeholder="The login button does not respond when clicked. Preserve the auth provider integration and add regression coverage."
          required
        />
      </div>

      <div className="field">
        <label htmlFor="branchPrefix">Branch prefix</label>
        <input id="branchPrefix" name="branchPrefix" defaultValue="agent" />
      </div>

      <div className="field">
        <label htmlFor="testCommand">Test command override</label>
        <input id="testCommand" name="testCommand" placeholder="pnpm test:e2e login.spec.ts" />
        <span className="help">Optional. Unsafe shell syntax is still blocked by the runner policy.</span>
      </div>

      <label className="checkbox-row" htmlFor="allowInstall">
        <input id="allowInstall" name="allowInstall" type="checkbox" />
        <span>
          Allow dependency install after approval
          <span className="help"> The runner will still create an approval item before installing.</span>
        </span>
      </label>

      <label className="checkbox-row" htmlFor="allowPr">
        <input id="allowPr" name="allowPr" type="checkbox" />
        <span>
          Allow PR creation flow
          <span className="help"> PR creation always requires explicit approval.</span>
        </span>
      </label>

      {error ? <span className="error-text">{error}</span> : null}
      {createdTaskId ? (
        <span className="success-text">Task accepted. Plan generation is queued for {createdTaskId}.</span>
      ) : null}

      <div className="toolbar">
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "Creating task..." : "Create agent task"}
        </button>
        <button
          className="button secondary"
          disabled={submitting}
          onClick={() => {
            setError("Runner offline. Check apps/runner before retrying.");
          }}
          type="button"
        >
          Simulate error state
        </button>
      </div>
    </form>
  );
}
