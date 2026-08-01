import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  type SessionUser,
  type UserRole,
} from "@/lib/auth";

interface UserRow extends RowDataPacket {
  id: number;
  employee_id: string | null;
  full_name: string;
  username: string;
  password_hash: string;
  role: UserRole;
  is_active: number;
}

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .max(100, "Username is too long."),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(255, "Password is too long."),
});

export async function POST(request: NextRequest) {
  try {
    const requestBody: unknown = await request.json();
    const validationResult = loginSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            validationResult.error.issues[0]?.message ??
            "Invalid login information.",
        },
        { status: 400 },
      );
    }

    const { username, password } = validationResult.data;

    const [users] = await pool.execute<UserRow[]>(
      `
        SELECT
          id,
          employee_id,
          full_name,
          username,
          password_hash,
          role,
          is_active
        FROM users
        WHERE username = ?
        LIMIT 1
      `,
      [username],
    );

    const databaseUser = users[0];

    if (!databaseUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid username or password.",
        },
        { status: 401 },
      );
    }

    if (databaseUser.is_active !== 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your account is inactive. Contact the administrator.",
        },
        { status: 403 },
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      databaseUser.password_hash,
    );

    if (!passwordMatches) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid username or password.",
        },
        { status: 401 },
      );
    }

    const sessionUser: SessionUser = {
      id: databaseUser.id,
      employeeId: databaseUser.employee_id,
      fullName: databaseUser.full_name,
      username: databaseUser.username,
      role: databaseUser.role,
    };

    const sessionToken = await createSessionToken(sessionUser);

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;

    await pool.execute(
      `
        INSERT INTO activity_logs (
          user_id,
          user_name,
          user_role,
          action,
          module,
          reference_table,
          reference_id,
          ip_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        sessionUser.id,
        sessionUser.fullName,
        sessionUser.role,
        "Logged in to the system",
        "Authentication",
        "users",
        String(sessionUser.id),
        ipAddress,
      ],
    );

    const response = NextResponse.json({
      success: true,
      message: "Login successful.",
      user: sessionUser,
      redirectTo: "/dashboard",
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to log in. Check the database connection and try again.",
        error:
          process.env.NODE_ENV === "development" &&
          error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}