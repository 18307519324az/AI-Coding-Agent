import { z } from "zod";

export const agentTaskStatusValues = [
  "CREATED",
  "REPO_CLONING",
  "CONTEXT_ANALYZING",
  "PLAN_GENERATED",
  "WAITING_FOR_PLAN_APPROVAL",
  "IMPLEMENTING",
  "TESTING",
  "E2E_VERIFYING",
  "SELF_REVIEWING",
  "WAITING_FOR_PR_APPROVAL",
  "PR_CREATING",
  "COMPLETED",
  "FAILED_CLONE",
  "FAILED_CONTEXT",
  "FAILED_IMPLEMENTATION",
  "FAILED_TEST",
  "FAILED_E2E",
  "FAILED_PR_CREATE",
  "FAILED",
  "CANCELLED"
] as const;

export const AgentTaskStatusSchema = z.enum(agentTaskStatusValues);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export const ApprovalTypeSchema = z.enum([
  "PLAN",
  "INSTALL_DEPENDENCY",
  "PUSH_BRANCH",
  "CREATE_PR"
]);
export type ApprovalType = z.infer<typeof ApprovalTypeSchema>;

export const ApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const TestStatusSchema = z.enum(["PASSED", "FAILED", "SKIPPED"]);
export type TestStatus = z.infer<typeof TestStatusSchema>;

export const RunnerJobTypeSchema = z.enum([
  "PLAN_TASK",
  "APPROVE_PLAN",
  "CREATE_PR"
]);
export type RunnerJobType = z.infer<typeof RunnerJobTypeSchema>;

export const RunnerJobStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export type RunnerJobStatus = z.infer<typeof RunnerJobStatusSchema>;

export const RepositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  url: z.string().url(),
  defaultBranch: z.string().default("main"),
  provider: z.literal("github"),
  createdAt: z.coerce.date()
});
export type Repository = z.infer<typeof RepositorySchema>;

export const ConnectRepositoryRequestSchema = z.object({
  repositoryUrl: z.string().url(),
  defaultBranch: z.string().min(1).default("main")
});
export type ConnectRepositoryRequest = z.infer<typeof ConnectRepositoryRequestSchema>;

export const PlanOutputSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  targetFiles: z.array(z.string()),
  steps: z.array(z.string()),
  risks: z.array(z.string()),
  requiresApproval: z.literal(true)
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const SelfReviewOutputSchema = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  testsRun: z.array(
    z.object({
      command: z.string(),
      status: TestStatusSchema
    })
  ),
  risks: z.array(z.string()),
  recommendation: z.string()
});
export type SelfReviewOutput = z.infer<typeof SelfReviewOutputSchema>;

export const PackageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]);
export type PackageManager = z.infer<typeof PackageManagerSchema>;

export const ProjectContextSchema = z.object({
  rootPath: z.string(),
  packageManager: PackageManagerSchema,
  projectKind: z.enum(["next", "vite", "node", "monorepo", "unknown"]),
  hasFrontend: z.boolean(),
  scripts: z.record(z.string()),
  recommendedCommands: z.object({
    install: z.string().optional(),
    lint: z.string().optional(),
    typecheck: z.string().optional(),
    test: z.string().optional(),
    e2e: z.string().optional()
  }),
  relevantFiles: z.array(z.string())
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const AgentTaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repositoryId: z.string(),
  title: z.string(),
  prompt: z.string(),
  issueUrl: z.string().url().optional(),
  status: AgentTaskStatusSchema,
  branchName: z.string().optional(),
  prUrl: z.string().url().optional(),
  plan: PlanOutputSchema.optional(),
  projectContext: ProjectContextSchema.optional(),
  selfReview: SelfReviewOutputSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const AgentRunLogSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  level: LogLevelSchema,
  phase: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date()
});
export type AgentRunLog = z.infer<typeof AgentRunLogSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: ApprovalTypeSchema,
  status: ApprovalStatusSchema,
  payload: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  resolvedAt: z.coerce.date().optional()
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const TestResultSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  command: z.string(),
  status: TestStatusSchema,
  output: z.string(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.coerce.date()
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const E2eScreenshotSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional()
});
export type E2eScreenshot = z.infer<typeof E2eScreenshotSchema>;

export const E2eArtifactSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  command: z.string(),
  reportUrl: z.string(),
  screenshots: z.array(E2eScreenshotSchema),
  createdAt: z.coerce.date()
});
export type E2eArtifact = z.infer<typeof E2eArtifactSchema>;

export const RunnerJobSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  type: RunnerJobTypeSchema,
  status: RunnerJobStatusSchema,
  payload: z.record(z.unknown()),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional()
});
export type RunnerJob = z.infer<typeof RunnerJobSchema>;

export const CreateTaskRequestSchema = z.object({
  repositoryUrl: z.string().url(),
  title: z.string().min(3).optional(),
  prompt: z.string().min(10).optional(),
  issueUrl: z.string().url().optional(),
  branchPrefix: z.string().min(1).default("agent"),
  testCommandOverride: z.string().optional(),
  allowDependencyInstall: z.boolean().default(false),
  allowCreatePr: z.boolean().default(false)
}).superRefine((request, context) => {
  if (request.issueUrl || (request.title && request.prompt)) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Provide title and prompt, or provide an issueUrl the runner can read.",
    path: ["issueUrl"]
  });
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type ResolvedCreateTaskRequest = CreateTaskRequest & {
  title: string;
  prompt: string;
};

export const RejectApprovalRequestSchema = z.object({
  reason: z.string().min(3)
});

export const CreatePrRequestSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(10)
});
export type CreatePrRequest = z.infer<typeof CreatePrRequestSchema>;

export const DiffSummarySchema = z.object({
  taskId: z.string(),
  filesChanged: z.array(z.string()),
  patch: z.string()
});
export type DiffSummary = z.infer<typeof DiffSummarySchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
