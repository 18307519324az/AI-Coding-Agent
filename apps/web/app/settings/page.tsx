import { MetricCard } from "@/components/metric-card";
import { getRunnerMetrics } from "@/lib/runner-api";

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return "No records";
  }

  return entries.map(([status, count]) => `${status}: ${count}`).join(", ");
}

export default async function SettingsPage() {
  const metrics = await getRunnerMetrics();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Controls</p>
          <h1>Settings</h1>
          <p className="page-subtitle">Operational defaults for approvals, command execution, and GitHub writes.</p>
        </div>
      </header>

      <section className="grid metrics" aria-label="Runner metrics" style={{ marginBottom: 16 }}>
        <MetricCard label="Runner uptime" value={`${metrics.uptimeSeconds}s`} note="Current API process age" />
        <MetricCard label="Tasks" value={String(metrics.tasks.total)} note={formatCounts(metrics.tasks.byStatus)} />
        <MetricCard label="Jobs" value={String(metrics.jobs.total)} note={formatCounts(metrics.jobs.byStatus)} />
        <MetricCard label="Pending approvals" value={String(metrics.approvals.pending)} note="Plan and PR gates" />
      </section>

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
          <p className="muted small" style={{ marginTop: 12 }}>
            Last metrics sample: {metrics.generatedAt.toLocaleString()} with {metrics.logs} logs and{" "}
            {metrics.traces} trace events.
          </p>
        </section>
      </div>
    </>
  );
}
