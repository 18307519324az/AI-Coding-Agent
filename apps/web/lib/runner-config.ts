export const runnerBaseUrl =
  process.env.RUNNER_API_URL ?? process.env.NEXT_PUBLIC_RUNNER_API_URL ?? "http://127.0.0.1:8787";

export function createRunnerHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const apiKey = process.env.RUNNER_API_KEY;
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return headers;
}
