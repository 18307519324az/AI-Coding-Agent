import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { listRunnerJobs, listTasks } from "@/lib/runner-api";

function formatDate(value: Date | undefined, fallback: string): string {
  return value ? value.toLocaleString() : fallback;
}

export default async function JobsPage() {
  const [jobs, tasks] = await Promise.all([listRunnerJobs(), listTasks()]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const queuedJobs = jobs.filter((job) => job.status === "QUEUED");
  const runningJobs = jobs.filter((job) => job.status === "RUNNING");
  const failedJobs = jobs.filter((job) => job.status === "FAILED");
  const waitingForBackoff = queuedJobs.filter((job) => job.nextRunAt && job.nextRunAt.getTime() > Date.now());

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h1>Runner Jobs</h1>
          <p className="page-subtitle">Inspect queued task work, retry attempts, backoff timing, and terminal errors.</p>
        </div>
      </header>

      <section className="grid metrics" aria-label="Runner job metrics">
        <MetricCard label="Queued" value={String(queuedJobs.length)} note={`${waitingForBackoff.length} waiting backoff`} />
        <MetricCard label="Running" value={String(runningJobs.length)} note="Active worker slots" />
        <MetricCard label="Failed" value={String(failedJobs.length)} note="Terminal job failures" />
        <MetricCard label="Total" value={String(jobs.length)} note="Persisted queue records" />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="page-header">
          <div>
            <h2>Queue Records</h2>
            <p className="muted small">Jobs are ordered by creation time and retain retry state after failures.</p>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">
            <strong>No runner jobs</strong>
            <span className="muted small">Queued mode records appear after task creation.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Next Run</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const task = job.taskId ? taskById.get(job.taskId) : undefined;
                  return (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.type.replaceAll("_", " ")}</strong>
                        <div className="muted small">{job.id}</div>
                      </td>
                      <td>
                        {task ? (
                          <Link href={`/tasks/${task.id}`}>
                            <strong>{task.title}</strong>
                          </Link>
                        ) : (
                          <span className="muted">{job.taskId ?? "Unassigned"}</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                        {job.error ? <div className="error-text">{job.error}</div> : null}
                      </td>
                      <td>
                        {job.attempts} / {job.maxAttempts}
                      </td>
                      <td className="muted">{formatDate(job.nextRunAt, job.status === "QUEUED" ? "Ready" : "None")}</td>
                      <td className="muted">{formatDate(job.completedAt ?? job.startedAt ?? job.createdAt, "Unknown")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
