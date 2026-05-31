import Link from "next/link";
import { notFound } from "next/navigation";
import { StateRail } from "@/components/state-rail";
import { StatusBadge } from "@/components/status-badge";
import { getTaskDetail } from "@/lib/runner-api";

export default async function TaskDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTaskDetail(id);
  if (!task) {
    notFound();
  }

  const repo = task.repository;
  const taskApprovals = task.approvals;
  const taskLogs = task.logs;
  const taskTests = task.tests;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Task detail</p>
          <h1>{task.title}</h1>
          <p className="page-subtitle">
            {repo ? `${repo.owner}/${repo.name}` : "Unknown repository"} · branch {task.branchName ?? "not created"}
          </p>
        </div>
        <div className="toolbar">
          <StatusBadge status={task.status} />
          <Link className="button secondary" href="/tasks">
            Back to tasks
          </Link>
        </div>
      </header>

      <div className="grid two">
        <section className="panel">
          <h2>Current Phase</h2>
          <StateRail status={task.status} />
        </section>

        <section className="panel">
          <h2>Approvals</h2>
          {taskApprovals.length === 0 ? (
            <div className="empty-state">
              <div>
                <strong>No approval waiting</strong>
                <p className="muted small">The runner will pause here before high-risk operations.</p>
              </div>
            </div>
          ) : (
            <div className="timeline">
              {taskApprovals.map((approval) => (
                <div className="timeline-item" key={approval.id}>
                  <strong>{approval.type.replaceAll("_", " ")}</strong>
                  <span className="muted small">{approval.status}</span>
                  <div className="toolbar" style={{ marginTop: 10 }}>
                    <button className="button">Approve {approval.type === "CREATE_PR" ? "PR" : "plan"}</button>
                    <button className="button danger">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Execution Plan</h2>
          {task.plan ? (
            <>
              <p>{task.plan.summary}</p>
              <h3>Steps</h3>
              <ol>
                {task.plan.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <h3>Risks</h3>
              <ul>
                {task.plan.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="empty-state">
              <strong>Plan is still loading</strong>
              <span className="muted small">Context analysis has not completed.</span>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Run Log</h2>
          {taskLogs.length === 0 ? (
            <div className="empty-state">
              <strong>No logs yet</strong>
              <span className="muted small">Logs appear when the runner starts work.</span>
            </div>
          ) : (
            <div className="timeline">
              {taskLogs.map((log) => (
                <div className="timeline-item" key={log.id}>
                  <strong>{log.phase}</strong>
                  <span className="muted small">{log.createdAt.toLocaleString()}</span>
                  <p className="small">{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Diff Preview</h2>
          {task.diff ? (
            <>
              <p className="muted small">{task.diff.filesChanged.join(", ")}</p>
              <pre className="diff">{task.diff.patch}</pre>
            </>
          ) : (
            <div className="empty-state">
              <strong>No diff yet</strong>
              <span className="muted small">Diff is available after implementation.</span>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Test Results</h2>
          {taskTests.length === 0 ? (
            <div className="alert">Tests have not run yet. The PR button remains disabled until checks finish.</div>
          ) : (
            <div className="timeline">
              {taskTests.map((test) => (
                <div className="timeline-item" key={test.id}>
                  <strong>{test.command}</strong>
                  <StatusBadge status={test.status} />
                  <p className="muted small">
                    {test.output} · {test.durationMs} ms
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Self Review</h2>
        {task.selfReview ? (
          <>
            <p>{task.selfReview.summary}</p>
            <p className="muted small">{task.selfReview.recommendation}</p>
          </>
        ) : (
          <div className="empty-state">
            <strong>Self-review pending</strong>
            <span className="muted small">The runner writes this after tests complete.</span>
          </div>
        )}
      </section>
    </>
  );
}
