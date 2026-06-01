import Link from "next/link";
import { notFound } from "next/navigation";
import { StateRail } from "@/components/state-rail";
import { StatusBadge } from "@/components/status-badge";
import { TaskApprovalPanel } from "@/components/task-approval-panel";
import { getTaskDetail, type TaskDetail } from "@/lib/runner-api";

function buildPrBody(task: TaskDetail): string {
  const changedFiles = task.diff?.filesChanged.length
    ? task.diff.filesChanged.map((file) => `- ${file}`).join("\n")
    : "- No file changes recorded";
  const tests = task.tests.length
    ? task.tests.map((test) => `- ${test.command}: ${test.status}`).join("\n")
    : "- No tests recorded";
  const risks = task.selfReview?.risks.length
    ? task.selfReview.risks.map((risk) => `- ${risk}`).join("\n")
    : task.plan?.risks.length
      ? task.plan.risks.map((risk) => `- ${risk}`).join("\n")
      : "- No known risks";

  return [
    "## Summary",
    task.selfReview?.summary ?? task.plan?.summary ?? task.title,
    "",
    "## Changed Files",
    changedFiles,
    "",
    "## Tests",
    tests,
    "",
    "## Risk",
    risks,
    "",
    "## Notes for Reviewer",
    task.selfReview?.recommendation ?? "Review the diff and test output before merging."
  ].join("\n");
}

function getPrDraftState(task: TaskDetail) {
  const hasPendingApproval = task.approvals.some(
    (approval) => approval.type === "CREATE_PR" && approval.status === "PENDING"
  );
  const hasPassingTests = task.tests.length > 0 && task.tests.every((test) => test.status === "PASSED");
  const canRequest = Boolean(task.diff && task.selfReview && hasPassingTests && !task.prUrl && !hasPendingApproval);
  let disabledReason = "Diff, passing tests, and self-review are required before requesting PR approval.";

  if (task.prUrl) {
    disabledReason = "A PR has already been created for this task.";
  } else if (hasPendingApproval) {
    disabledReason = "Review the pending CREATE PR approval above.";
  } else if (!task.diff) {
    disabledReason = "Implementation diff is not available yet.";
  } else if (!task.selfReview) {
    disabledReason = "Self-review is still pending.";
  } else if (!hasPassingTests) {
    disabledReason = "All recorded tests must pass before PR approval can be requested.";
  }

  return {
    title: task.title,
    body: buildPrBody(task),
    canRequest,
    disabledReason,
    hasPendingApproval,
    prUrl: task.prUrl
  };
}

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
  const taskE2eArtifacts = task.e2eArtifacts;
  const taskLogs = task.logs;
  const taskTests = task.tests;
  const approvalViews = taskApprovals.map((approval) => ({
    ...approval,
    createdAt: approval.createdAt.toISOString(),
    resolvedAt: approval.resolvedAt?.toISOString()
  }));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Task detail</p>
          <h1>{task.title}</h1>
          <p className="page-subtitle">
            {repo ? `${repo.owner}/${repo.name}` : "Unknown repository"} - branch {task.branchName ?? "not created"}
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

        <TaskApprovalPanel approvals={approvalViews} prDraft={getPrDraftState(task)} taskId={task.id} />
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
          <h2>Project Context</h2>
          {task.projectContext ? (
            <div className="grid" style={{ gap: 10 }}>
              <div>
                <span className="muted small">Project</span>
                <p>
                  <strong>{task.projectContext.projectKind}</strong> using{" "}
                  <strong>{task.projectContext.packageManager}</strong>
                </p>
              </div>
              <div>
                <span className="muted small">Recommended commands</span>
                <ul>
                  {Object.entries(task.projectContext.recommendedCommands)
                    .filter(([, command]) => Boolean(command))
                    .map(([name, command]) => (
                      <li key={name}>
                        <strong>{name}</strong>: {command}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <span className="muted small">Relevant files</span>
                <p className="small">{task.projectContext.relevantFiles.slice(0, 8).join(", ")}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>Context pending</strong>
              <span className="muted small">The runner records project structure after repository analysis.</span>
            </div>
          )}
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
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
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
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
                    {test.output} - {test.durationMs} ms
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
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
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>E2E Report</h2>
        {taskE2eArtifacts.length === 0 ? (
          <div className="empty-state">
            <strong>No browser artifacts yet</strong>
            <span className="muted small">Playwright report and screenshot references appear after E2E verification.</span>
          </div>
        ) : (
          <div className="timeline">
            {taskE2eArtifacts.map((artifact) => (
              <div className="timeline-item" key={artifact.id}>
                <strong>{artifact.command}</strong>
                <span className="muted small">{artifact.createdAt.toLocaleString()}</span>
                <p className="small">Report: {artifact.reportUrl}</p>
                <ul>
                  {artifact.screenshots.map((screenshot) => (
                    <li key={screenshot.path}>
                      <strong>{screenshot.name}</strong>: {screenshot.path}
                      {screenshot.description ? <span className="muted"> - {screenshot.description}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
