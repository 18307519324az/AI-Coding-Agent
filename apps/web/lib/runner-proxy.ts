import { createRunnerHeaders, runnerBaseUrl } from "./runner-config";

export async function forwardRunnerPost(path: string, request: Request): Promise<Response> {
  try {
    const response = await fetch(`${runnerBaseUrl}${path}`, {
      method: "POST",
      headers: createRunnerHeaders({
        "Content-Type": request.headers.get("content-type") ?? "application/json"
      }),
      body: await request.text(),
      cache: "no-store"
    });
    const body = await response.text();
    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    return new Response(body, {
      status: response.status,
      headers
    });
  } catch {
    return Response.json({ error: "Runner unavailable." }, { status: 502 });
  }
}
