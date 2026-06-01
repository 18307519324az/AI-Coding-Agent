"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApprovalView = {
  id: string;
  type: "PLAN" | "INSTALL_DEPENDENCY" | "PUSH_BRANCH" | "CREATE_PR";
  status: "PENDING" | "APPROVED" | "REJECTED";
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
};

type PrDraftState = {
  title: string;
  body: string;
  canRequest: boolean;
  disabledReason: string;
  hasPendingApproval: boolean;
  prUrl?: string;
};

type TaskApprovalPanelProps = {
  approvals: ApprovalView[];
  prDraft: PrDraftState;
  taskId: string;
};

function approvalTitle(type: ApprovalView["type"]): string {
  return type.replaceAll("_", " ");
}

function approveButtonLabel(type: ApprovalView["type"]): string {
  if (type === "PLAN") {
    return "Approve plan and start implementation";
  }
  if (type === "CREATE_PR") {
    return "Approve PR";
  }
  if (type === "PUSH_BRANCH") {
    return "Approve branch push";
  }
  return "Approve dependency install";
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  return body?.error ?? fallback;
}

export function TaskApprovalPanel({ approvals, prDraft, taskId }: TaskApprovalPanelProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectingApprovalId, setRejectingApprovalId] = useState("");
  const [rejectReason, setRejectReason] = useState("Need a narrower plan before continuing.");
  const [prTitle, setPrTitle] = useState(prDraft.title);
  const [prBody, setPrBody] = useState(prDraft.body);

  async function approve(approval: ApprovalView): Promise<void> {
    setBusyAction(`approve:${approval.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/runner/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(approval.id)}/approve`,
        {
          method: "POST"
        }
      );
      if (!response.ok) {
        throw new Error(await readError(response, "Runner rejected the approval."));
      }

      setMessage(`${approvalTitle(approval.type)} approved. Refreshing task state.`);
      router.refresh();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Approval request failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function reject(approval: ApprovalView): Promise<void> {
    if (rejectReason.trim().length < 3) {
      setError("Add a rejection reason before cancelling the task.");
      return;
    }

    setBusyAction(`reject:${approval.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/runner/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(approval.id)}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            reason: rejectReason.trim()
          })
        }
      );
      if (!response.ok) {
        throw new Error(await readError(response, "Runner rejected the cancellation."));
      }

      setMessage(`${approvalTitle(approval.type)} rejected. Task state is refreshing.`);
      setRejectingApprovalId("");
      router.refresh();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Rejection request failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function requestPrApproval(): Promise<void> {
    setBusyAction("create-pr");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/runner/tasks/${encodeURIComponent(taskId)}/create-pr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: prTitle.trim(),
          body: prBody.trim()
        })
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Runner rejected the PR request."));
      }

      setMessage("PR approval request created. Refreshing task state.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "PR request failed.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="panel">
      <h2>Approvals</h2>
      {approvals.length === 0 ? (
        <div className="empty-state">
          <div>
            <strong>No approval waiting</strong>
            <p className="muted small">The runner will pause here before high-risk operations.</p>
          </div>
        </div>
      ) : (
        <div className="timeline">
          {approvals.map((approval) => {
            const isPending = approval.status === "PENDING";
            const isRejecting = rejectingApprovalId === approval.id;
            return (
              <div className="timeline-item" key={approval.id}>
                <strong>{approvalTitle(approval.type)}</strong>
                <span className="muted small">
                  {approval.status} - requested {new Date(approval.createdAt).toLocaleString()}
                </span>
                {typeof approval.payload.title === "string" ? (
                  <p className="small">Draft: {approval.payload.title}</p>
                ) : null}
                {isPending ? (
                  <div className="approval-actions">
                    <div className="toolbar">
                      <button
                        className="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => void approve(approval)}
                        type="button"
                      >
                        {busyAction === `approve:${approval.id}` ? "Approving..." : approveButtonLabel(approval.type)}
                      </button>
                      <button
                        className="button danger"
                        disabled={Boolean(busyAction)}
                        onClick={() => setRejectingApprovalId(isRejecting ? "" : approval.id)}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                    {isRejecting ? (
                      <div className="field compact-field">
                        <label htmlFor={`reject-${approval.id}`}>Rejection reason</label>
                        <textarea
                          id={`reject-${approval.id}`}
                          onChange={(event) => setRejectReason(event.target.value)}
                          value={rejectReason}
                        />
                        <button
                          className="button danger"
                          disabled={Boolean(busyAction)}
                          onClick={() => void reject(approval)}
                          type="button"
                        >
                          {busyAction === `reject:${approval.id}` ? "Rejecting..." : "Confirm rejection"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="divider" />

      <h3>PR Draft</h3>
      {prDraft.prUrl ? (
        <a className="button secondary" href={prDraft.prUrl}>
          Open created PR
        </a>
      ) : prDraft.canRequest ? (
        <div className="form compact-form">
          <div className="field">
            <label htmlFor="pr-title">PR title</label>
            <input id="pr-title" onChange={(event) => setPrTitle(event.target.value)} value={prTitle} />
          </div>
          <div className="field">
            <label htmlFor="pr-body">PR body</label>
            <textarea id="pr-body" onChange={(event) => setPrBody(event.target.value)} value={prBody} />
          </div>
          <button
            className="button"
            disabled={Boolean(busyAction) || prTitle.trim().length < 3 || prBody.trim().length < 10}
            onClick={() => void requestPrApproval()}
            type="button"
          >
            {busyAction === "create-pr" ? "Requesting PR approval..." : "Request PR approval"}
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <strong>{prDraft.hasPendingApproval ? "PR approval is waiting" : "PR request unavailable"}</strong>
          <span className="muted small">{prDraft.disabledReason}</span>
        </div>
      )}

      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </section>
  );
}
