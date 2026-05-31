"use client";

import { useState } from "react";

const runnerBaseUrl = process.env.NEXT_PUBLIC_RUNNER_API_URL ?? "http://127.0.0.1:8787";

export function RepositoryForm() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="form panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setSaved(false);
        setError("");

        const form = new FormData(event.currentTarget);
        try {
          const response = await fetch(`${runnerBaseUrl}/api/repositories`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              repositoryUrl: form.get("repoUrl"),
              defaultBranch: form.get("defaultBranch") || "main"
            })
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
            throw new Error(body?.error ?? "Runner rejected the repository request.");
          }

          setSaved(true);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Runner offline. Try again after it restarts.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="repoUrl">GitHub repository URL</label>
        <input id="repoUrl" name="repoUrl" placeholder="https://github.com/acme/repo" required type="url" />
        <span className="help">Use a repository-scoped token in the runner environment for private repos.</span>
      </div>
      <div className="field">
        <label htmlFor="defaultBranch">Default branch</label>
        <input id="defaultBranch" name="defaultBranch" defaultValue="main" />
      </div>
      {error ? <span className="error-text">{error}</span> : null}
      {saved ? <span className="success-text">Repository connection saved for task creation.</span> : null}
      <button className="button" disabled={saving} type="submit">
        {saving ? "Saving repository..." : "Save repository"}
      </button>
    </form>
  );
}
