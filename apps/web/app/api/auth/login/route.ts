import { NextResponse } from "next/server";
import {
  createWebAuthSessionToken,
  getRequestOrigin,
  getSafeRedirectPath,
  getWebAuthSessionMaxAgeSeconds,
  isWebAuthCredentialValid,
  isWebAuthEnabled,
  WEB_AUTH_COOKIE_NAME
} from "@/lib/web-auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const nextPath = getSafeRedirectPath(formData.get("next"));
  const origin = getRequestOrigin(request);

  if (!isWebAuthEnabled()) {
    return NextResponse.redirect(new URL(nextPath, origin));
  }

  if (!isWebAuthCredentialValid(formData.get("username"), formData.get("password"))) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.cookies.set(WEB_AUTH_COOKIE_NAME, await createWebAuthSessionToken(), {
    httpOnly: true,
    maxAge: getWebAuthSessionMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
