import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  backupFilePath,
  safeBackupFilename,
} from "../../backup-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const user = await getCurrentUser();

  if (!user || !["ADMIN", "OWNER"].includes(user.role)) {
    return NextResponse.json(
      { message: "Unauthorized." },
      { status: 403 },
    );
  }

  try {
    const { filename: rawFilename } = await context.params;
    const filename = safeBackupFilename(decodeURIComponent(rawFilename));
    const fullPath = await backupFilePath(filename);
    const buffer = await fs.readFile(fullPath);

    await pool.execute(
      `
        INSERT INTO activity_logs (
          user_id,
          user_name,
          user_role,
          action,
          module,
          reference_table,
          reference_id
        )
        VALUES (?, ?, ?, ?, 'Backup & Restore', 'database_backup', ?)
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Downloaded database backup "${filename}".`,
        filename,
      ],
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Backup file not found.",
      },
      { status: 404 },
    );
  }
}
