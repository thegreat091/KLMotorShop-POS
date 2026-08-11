import { cookies } from "next/headers";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "kl_motor_shop_session";

export type UserRole = "ADMIN" | "CASHIER" | "INVENTORY" | "OWNER";

export interface SessionUser {
  id: number;
  employeeId: string | null;
  fullName: string;
  username: string;
  role: UserRole;
}

interface SessionPayload extends JWTPayload {
  userId: number;
  employeeId: string | null;
  fullName: string;
  username: string;
  role: UserRole;
}

function getAuthenticationSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "AUTH_SECRET is missing. Add AUTH_SECRET to the .env.local file.",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  user: SessionUser,
): Promise<string> {
  const payload: SessionPayload = {
    userId: user.id,
    employeeId: user.employeeId,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getAuthenticationSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      getAuthenticationSecret(),
    );

    if (
      typeof payload.userId !== "number" ||
      typeof payload.fullName !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }

    const validRoles: UserRole[] = [
      "ADMIN",
      "CASHIER",
      "INVENTORY",
      "OWNER",
    ];

    if (!validRoles.includes(payload.role as UserRole)) {
      return null;
    }

    return {
      id: payload.userId,
      employeeId:
        typeof payload.employeeId === "string"
          ? payload.employeeId
          : null,
      fullName: payload.fullName,
      username: payload.username,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  return verifySessionToken(sessionCookie.value);
}