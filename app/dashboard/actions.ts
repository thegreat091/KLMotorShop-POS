"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

function cleanKey(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().slice(0, 190);
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const key = cleanKey(formData.get("notificationKey"));
  if (!key) return;

  await pool.execute(
    `
      INSERT INTO dashboard_notification_states
        (user_id, notification_key, is_read, is_dismissed, read_at)
      VALUES (?, ?, 1, 0, NOW())
      ON DUPLICATE KEY UPDATE
        is_read = 1,
        read_at = NOW(),
        updated_at = NOW()
    `,
    [user.id, key],
  );

  revalidatePath("/dashboard");
}

export async function dismissNotificationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const key = cleanKey(formData.get("notificationKey"));
  if (!key) return;

  await pool.execute(
    `
      INSERT INTO dashboard_notification_states
        (user_id, notification_key, is_read, is_dismissed, read_at, dismissed_at)
      VALUES (?, ?, 1, 1, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        is_read = 1,
        is_dismissed = 1,
        read_at = COALESCE(read_at, NOW()),
        dismissed_at = NOW(),
        updated_at = NOW()
    `,
    [user.id, key],
  );

  revalidatePath("/dashboard");
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const raw = String(formData.get("notificationKeys") ?? "");
  const keys = raw
    .split("|")
    .map((key) => key.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (keys.length === 0) return;

  const values = keys.map(() => "(?, ?, 1, 0, NOW())").join(", ");
  const params: Array<string | number> = [];

  for (const key of keys) {
    params.push(user.id, key.slice(0, 190));
  }

  await pool.execute(
    `
      INSERT INTO dashboard_notification_states
        (user_id, notification_key, is_read, is_dismissed, read_at)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE
        is_read = 1,
        read_at = NOW(),
        updated_at = NOW()
    `,
    params,
  );

  revalidatePath("/dashboard");
}
