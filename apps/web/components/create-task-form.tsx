"use client";

import { useState } from "react";

export function CreateTaskForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="form panel"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setSubmitting(true);
        window.setTimeout(() => {
          setSubmitting(false);
          setSubmitted(true);
        }, 350);
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
      {submitted ? <span className="success-text">Task accepted. Plan generation is queued.</span> : null}

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

