import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

interface ExistingAdminRow extends RowDataPacket {
  id: number;
}

export async function POST() {
  try {
    const [existingAdmins] = await pool.query<ExistingAdminRow[]>(
      `
        SELECT id
        FROM users
        WHERE role = 'ADMIN'
        LIMIT 1
      `,
    );

    if (existingAdmins.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "An administrator account already exists.",
        },
        { status: 409 },
      );
    }

    const username = "admin";
    const password = "admin123";
    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute<ResultSetHeader>(
      `
        INSERT INTO users (
          employee_id,
          full_name,
          username,
          password_hash,
          role,
          is_active
        )
        VALUES (?, ?, ?, ?, 'ADMIN', 1)
      `,
      [
        "EMP-0001",
        "System Administrator",
        username,
        passwordHash,
      ],
    );

    return NextResponse.json({
      success: true,
      message: "Administrator account created successfully.",
      userId: result.insertId,
      login: {
        username,
        password,
      },
    });
  } catch (error) {
    console.error("Administrator setup error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create the administrator account.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 },
    );
  }
}