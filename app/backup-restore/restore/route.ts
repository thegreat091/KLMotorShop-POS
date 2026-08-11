import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { restoreDatabaseFromFile } from "../backup-utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user || !["ADMIN", "OWNER"].includes(user.role)) {
    return NextResponse.json(
      { message: "Unauthorized." },
      { status: 403 },
    );
  }

  let tempPath = "";

  try {
    const formData = await request.formData();
    const confirmation = String(formData.get("confirmation") ?? "").trim();
    const file = formData.get("backup_file");

    if (confirmation !== "RESTORE") {
      return NextResponse.json(
        { message: 'Type "RESTORE" exactly to confirm.' },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Choose an SQL backup file." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".sql")) {
      return NextResponse.json(
        { message: "Only .sql backup files can be restored." },
        { status: 400 },
      );
    }

    // 250 MB guard for accidental/incorrect uploads.
    if (file.size <= 0 || file.size > 250 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Backup file must be between 1 byte and 250 MB." },
        { status: 400 },
      );
    }

    const safeTempName =
      `klmotor-restore-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.sql`;

    tempPath = path.join(os.tmpdir(), safeTempName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    await restoreDatabaseFromFile(tempPath);

    // Log after restore because the restored database may contain a different
    // activity log history.
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
        VALUES (?, ?, ?, ?, 'Backup & Restore', 'database_restore', ?)
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Restored database from "${file.name}".`,
        file.name,
      ],
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      message: "Database restored successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to restore database.",
      },
      { status: 500 },
    );
  } finally {
    if (tempPath) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }
}
