import { redactMetadata, redactSecrets } from "@ai-coding-agent/agent-core";
import type { AgentRunLog, AgentTraceEvent, LogLevel, TraceEventType } from "@ai-coding-agent/shared";
import { createId } from "./ids";

export function createRunLog(input: {
  taskId: string;
  level: LogLevel;
  phase: string;
  message: string;
  metadata?: Record<string, unknown>;
}): AgentRunLog {
  return {
    id: createId("log"),
    taskId: input.taskId,
    level: input.level,
    phase: input.phase,
    message: redactSecrets(input.message),
    metadata: redactMetadata(input.metadata),
    createdAt: new Date()
  };
}

export function createTraceEvent(input: {
  taskId: string;
  type: TraceEventType;
  phase: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): AgentTraceEvent {
  return {
    id: createId("trace"),
    taskId: input.taskId,
    type: input.type,
    phase: input.phase,
    summary: redactSecrets(input.summary),
    metadata: redactMetadata(input.metadata),
    createdAt: new Date()
  };
}
