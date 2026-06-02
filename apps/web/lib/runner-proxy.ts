import { createRunnerHeaders, runnerBaseUrl } from "./runner-config";

export async function forwardRunnerPost(path: string, request: Request): Promise<Response> {
  try {
    const body = await request.text();
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (body && contentType) {
      headers.set("Content-Type", contentType);
    } else if (body) {
      headers.set("Content-Type", "application/json");
    } else {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${runnerBaseUrl}${path}`, {
      method: "POST",
      headers: createRunnerHeaders(headers),
      body: body || "{}",
      cache: "no-store"
    });
    const responseBody = await response.text();
    const responseHeaders = new Headers();
    const responseContentType = response.headers.get("content-type");
    if (responseContentType) {
      responseHeaders.set("Content-Type", responseContentType);
    }

    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders
    });
  } catch {
    return Response.json({ error: "Runner unavailable." }, { status: 502 });
  }
}
