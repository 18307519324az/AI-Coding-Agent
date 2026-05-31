export default function SettingsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Controls</p>
          <h1>Settings</h1>
          <p className="page-subtitle">Operational defaults for approvals, command execution, and GitHub writes.</p>
        </div>
      </header>

      <div className="grid two">
        <section className="panel">
          <h2>Approval Policy</h2>
          <div className="timeline">
            <div className="timeline-item">
              <strong>Plan approval</strong>
              <span className="muted small">Required before file edits.</span>
            </div>
            <div className="timeline-item">
              <strong>Dependency install</strong>
              <span className="muted small">Required before package manager install commands.</span>
            </div>
            <div className="timeline-item">
              <strong>Push and PR creation</strong>
              <span className="muted small">Required before GitHub write operations.</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Runner Boundary</h2>
          <div className="alert">Dangerous shell commands are blocked even when a prompt asks for them.</div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Logs are redacted before storage. Secrets must stay in environment variables and never in task prompts.
          </p>
        </section>
      </div>
    </>
  );
}

