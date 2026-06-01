export const WEB_AUTH_COOKIE_NAME = "ai_coding_agent_session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function isWebAuthEnabled(): boolean {
  return Boolean(process.env.WEB_AUTH_PASSWORD);
}

export function getWebAuthUsername(): string {
  return process.env.WEB_AUTH_USERNAME ?? "admin";
}

export function getWebAuthSessionMaxAgeSeconds(): number {
  const configured = Number(process.env.WEB_AUTH_SESSION_MAX_AGE_SECONDS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null | undefined): string {
  const path = typeof value === "string" ? value : undefined;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) {
    return "/";
  }
  return path;
}

export function getRequestOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    return origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost) {
    return `${request.headers.get("x-forwarded-proto") ?? "http"}://${forwardedHost}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return "http://127.0.0.1:3000";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function createWebAuthSessionToken(): Promise<string> {
  const password = process.env.WEB_AUTH_PASSWORD ?? "";
  const secret = process.env.WEB_AUTH_SESSION_SECRET ?? password;
  return sha256Hex(`${secret}:${getWebAuthUsername()}:${password}`);
}

export async function verifyWebAuthSessionToken(token: string | undefined): Promise<boolean> {
  if (!isWebAuthEnabled()) {
    return true;
  }
  if (!token) {
    return false;
  }
  return constantTimeEquals(token, await createWebAuthSessionToken());
}

export function isWebAuthCredentialValid(username: FormDataEntryValue | null, password: FormDataEntryValue | null): boolean {
  if (!isWebAuthEnabled()) {
    return true;
  }
  return username === getWebAuthUsername() && password === process.env.WEB_AUTH_PASSWORD;
}
