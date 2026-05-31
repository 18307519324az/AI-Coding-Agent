"use client";

import { useState } from "react";

export function RepositoryForm() {
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="form panel"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
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
      {saved ? <span className="success-text">Repository connection saved for task creation.</span> : null}
      <button className="button" type="submit">
        Save repository
      </button>
    </form>
  );
}

