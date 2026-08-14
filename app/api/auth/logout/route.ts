import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
}

function getBrowserOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");

  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");

  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") ?? false;

  if (acceptsHtml) {
    const browserOrigin = getBrowserOrigin(request);

    if (browserOrigin) {
      const response = NextResponse.redirect(
        new URL("/", browserOrigin),
        {
          status: 303,
        },
      );

      clearSessionCookie(response);

      return response;
    }
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
    redirectTo: "/",
  });

  clearSessionCookie(response);

  return response;
}