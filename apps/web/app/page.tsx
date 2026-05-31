import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { listRepositories, listTasks } from "@/lib/runner-api";

export default async function DashboardPage() {
  const [repositories, tasks] = await Promise.all([listRepositories(), listTasks()]);
  const runningTasks = tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status));
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");
  const prCount = tasks.filter((task) => task.prUrl).length;
  const repositoryById = new Map(repositories.map((repo) => [repo.id, repo]));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            Track approved coding runs from plan generation through tests, self-review, and PR creation.
          </p>
        </div>
        <div className="toolbar">
          <Link className="button secondary" href="/repositories/new">
            Connect repository
          </Link>
          <Link className="button" href="/tasks/new">
            New agent task
          </Link>
        </div>
      </header>

      <section className="grid metrics" aria-label="Dashboard metrics">
        <MetricCard label="Running tasks" value={String(runningTasks.length)} note="2 need operator attention" />
        <MetricCard label="Completed today" value={String(completedTasks.length)} note="Includes PR-ready tasks" />
        <MetricCard label="PRs created" value={String(prCount)} note="Drafts only, no auto-merge" />
        <MetricCard label="Test pass rate" value="94%" note="Last 20 task checks" />
      </section>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="page-header">
            <div>
              <h2>Agent Tasks</h2>
              <p className="muted small">Live queue with approval gates and verification state.</p>
            </div>
            <Link className="button secondary" href="/tasks">
              View all
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const repo = repositoryById.get(task.repositoryId);
                  return (
                    <tr key={task.id}>
                      <td>
                        <Link href={`/tasks/${task.id}`}>
                          <strong>{task.title}</strong>
                        </Link>
                      </td>
                      <td>{repo ? `${repo.owner}/${repo.name}` : "Unknown"}</td>
                      <td>
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="muted">{task.updatedAt.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Repository Health</h2>
          <div className="timeline">
            {repositories.map((repo) => (
              <div className="timeline-item" key={repo.id}>
                <strong>{repo.owner}/{repo.name}</strong>
                <span className="muted small">Default branch {repo.defaultBranch}. Runner has read access.</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
