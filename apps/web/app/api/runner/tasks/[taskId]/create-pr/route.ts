import { forwardRunnerPost } from "@/lib/runner-proxy";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { taskId } = await context.params;
  return forwardRunnerPost(`/api/tasks/${encodeURIComponent(taskId)}/create-pr`, request);
}
