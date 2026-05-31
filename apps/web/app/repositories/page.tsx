import Link from "next/link";
import { repositories, tasks } from "@/lib/mock-data";

export default function RepositoriesPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1>Repositories</h1>
          <p className="page-subtitle">Connect GitHub repositories that the runner may clone into isolated workspaces.</p>
        </div>
        <Link className="button" href="/repositories/new">
          Connect repository
        </Link>
      </header>

      <section className="panel">
        {repositories.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No repositories connected</strong>
              <p className="muted small">Connect a GitHub repository before creating tasks.</p>
            </div>
            <Link className="button" href="/repositories/new">
              Connect repository
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Default branch</th>
                  <th>Tasks</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {repositories.map((repo) => (
                  <tr key={repo.id}>
                    <td>
                      <strong>{repo.owner}/{repo.name}</strong>
                      <div className="muted small">{repo.url}</div>
                    </td>
                    <td>{repo.defaultBranch}</td>
                    <td>{tasks.filter((task) => task.repositoryId === repo.id).length}</td>
                    <td className="muted">{repo.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

