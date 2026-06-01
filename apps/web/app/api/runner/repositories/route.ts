import { forwardRunnerPost } from "@/lib/runner-proxy";

export async function POST(request: Request): Promise<Response> {
  return forwardRunnerPost("/api/repositories", request);
}
