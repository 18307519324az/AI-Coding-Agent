import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { listRepositories, listTasks } from "@/lib/runner-api";

export default async function TasksPage() {
  const [repositories, tasks] = await Promise.all([listRepositories(), listTasks()]);
  const repositoryById = new Map(repositories.map((repo) => [repo.id, repo]));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h1>Tasks</h1>
          <p className="page-subtitle">Review every Agent run, including approvals, tests, diffs, and PR state.</p>
        </div>
        <Link className="button" href="/tasks/new">
          New agent task
        </Link>
      </header>

      <section className="panel">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <button className="button secondary">All</button>
          <button className="button secondary">Waiting approval</button>
          <button className="button secondary">Failed</button>
          <button className="button secondary" disabled>
            Bulk approve disabled
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No tasks yet</strong>
              <p className="muted small">Create a task after connecting a GitHub repository.</p>
            </div>
            <Link className="button" href="/tasks/new">
              Create task
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Branch</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const repo = repositoryById.get(task.repositoryId);
                  return (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        <div className="muted small">{task.prompt}</div>
                      </td>
                      <td>{repo ? `${repo.owner}/${repo.name}` : "Unknown"}</td>
                      <td>
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="muted">{task.branchName ?? "Not created"}</td>
                      <td>
                        <Link className="button secondary" href={`/tasks/${task.id}`}>
                          Open
                        </Link>
                      </td>
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
