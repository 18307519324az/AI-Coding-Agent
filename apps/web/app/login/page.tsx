import { redirect } from "next/navigation";
import { getSafeRedirectPath, getWebAuthUsername, isWebAuthEnabled } from "@/lib/web-auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isWebAuthEnabled()) {
    redirect("/");
  }

  const params = await searchParams;
  const nextPath = getSafeRedirectPath(params.next);
  const hasError = params.error === "invalid";

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <div>
        <p className="eyebrow">Operator access</p>
        <h1 id="login-title">Sign in</h1>
        <p className="page-subtitle">Use the configured Web console credentials to continue.</p>
      </div>

      <form className="form auth-form" action="/api/auth/login" method="post">
        <input name="next" type="hidden" value={nextPath} />
        <div className="field">
          <label htmlFor="username">Username</label>
          <input autoComplete="username" defaultValue={getWebAuthUsername()} id="username" name="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input autoComplete="current-password" id="password" name="password" required type="password" />
        </div>
        {hasError ? <p className="error-text">Invalid username or password.</p> : null}
        <button className="button" type="submit">
          Sign in
        </button>
      </form>
    </section>
  );
}
