"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  createDatabaseBackup,
  deleteBackupFile,
  safeBackupFilename,
} from "./backup-utils";

async function requireBackupAccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "OWNER"].includes(user.role)) redirect("/dashboard");
  return user;
}

async function logAction(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  action: string,
  referenceId: string,
) {
  if (!user) return;
  await pool.execute(
    `
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action, module, reference_table, reference_id
      )
      VALUES (?, ?, ?, ?, 'Backup & Restore', 'database_backup', ?)
    `,
    [user.id, user.fullName, user.role, action, referenceId],
  );
}

export async function createBackupAction() {
  const user = await requireBackupAccess();
  let successMessage = "";
  let errorMessage = "";

  try {
    const backup = await createDatabaseBackup(user.fullName, user.role);
    await logAction(user, `Created database backup "${backup.filename}".`, backup.filename);
    revalidatePath("/backup-restore");
    successMessage = `Backup created: ${backup.filename}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to create backup.";
  }

  if (errorMessage) {
    redirect(`/backup-restore?error=${encodeURIComponent(errorMessage)}`);
  }
  redirect(`/backup-restore?success=${encodeURIComponent(successMessage)}`);
}

export async function deleteBackupAction(formData: FormData) {
  const user = await requireBackupAccess();
  const filename = String(formData.get("filename") ?? "").trim();
  let successMessage = "";
  let errorMessage = "";

  try {
    const safe = safeBackupFilename(filename);
    await deleteBackupFile(safe);
    await logAction(user, `Deleted database backup "${safe}".`, safe);
    revalidatePath("/backup-restore");
    successMessage = `Backup deleted: ${safe}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to delete backup.";
  }

  if (errorMessage) {
    redirect(`/backup-restore?error=${encodeURIComponent(errorMessage)}`);
  }
  redirect(`/backup-restore?success=${encodeURIComponent(successMessage)}`);
}
