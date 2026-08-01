import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
}

export async function POST(request: NextRequest) {
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") ??
    false;

  if (acceptsHtml) {
    const response = NextResponse.redirect(
      new URL("/", request.url),
      {
        status: 303,
      },
    );

    clearSessionCookie(response);

    return response;
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
  });

  clearSessionCookie(response);

  return response;
}