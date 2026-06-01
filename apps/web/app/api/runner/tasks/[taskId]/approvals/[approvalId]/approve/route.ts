import { forwardRunnerPost } from "@/lib/runner-proxy";

type RouteContext = {
  params: Promise<{
    taskId: string;
    approvalId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { taskId, approvalId } = await context.params;
  return forwardRunnerPost(
    `/api/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(approvalId)}/approve`,
    request
  );
}
