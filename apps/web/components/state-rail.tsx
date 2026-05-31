import type { AgentTaskStatus } from "@ai-coding-agent/shared";

const orderedStates: AgentTaskStatus[] = [
  "CREATED",
  "CONTEXT_ANALYZING",
  "PLAN_GENERATED",
  "WAITING_FOR_PLAN_APPROVAL",
  "IMPLEMENTING",
  "TESTING",
  "E2E_VERIFYING",
  "SELF_REVIEWING",
  "WAITING_FOR_PR_APPROVAL",
  "PR_CREATING",
  "COMPLETED"
];

export function StateRail({ status }: { status: AgentTaskStatus }) {
  const currentIndex = orderedStates.indexOf(status);

  return (
    <div className="state-rail" aria-label="Task state">
      {orderedStates.map((state, index) => {
        const className =
          index < currentIndex ? "state-step done" : index === currentIndex ? "state-step current" : "state-step";
        return (
          <div className={className} key={state}>
            <span className="state-step-marker" />
            <span className="state-step-label">{state.replaceAll("_", " ")}</span>
          </div>
        );
      })}
    </div>
  );
}

