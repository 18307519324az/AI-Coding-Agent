import { NextResponse } from "next/server";
import { getRequestOrigin, isWebAuthEnabled, WEB_AUTH_COOKIE_NAME } from "@/lib/web-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL(isWebAuthEnabled() ? "/login" : "/", getRequestOrigin(request)));
  response.cookies.set(WEB_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
