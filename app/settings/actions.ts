"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function requireSettingsAccess() {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["ADMIN", "OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}

async function saveSetting(
  key: string,
  value: string,
  userId: number,
) {
  await pool.execute(
    `
      INSERT INTO system_settings (
        setting_key,
        setting_value,
        updated_by
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
    `,
    [key, value, userId],
  );
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requireSettingsAccess();

  const shopName = clean(formData.get("shop_name")) || "KL Motor Shop";
  const address = clean(formData.get("shop_address"));
  const contact = clean(formData.get("shop_contact"));
  const email = clean(formData.get("shop_email"));
  const tin = clean(formData.get("shop_tin"));
  const receiptFooter = clean(formData.get("receipt_footer"));

  const ownerShare = Number(clean(formData.get("default_owner_percentage")) || "20");
  const mechanicShare = Number(clean(formData.get("default_mechanic_percentage")) || "80");

  const defaultReorderLevel = Number(clean(formData.get("default_reorder_level")) || "0");

  const receiptPaperSize = clean(formData.get("receipt_paper_size")) || "LETTER";
  const currency = clean(formData.get("currency")) || "PHP";
  const timezone = clean(formData.get("timezone")) || "Asia/Manila";

  const receiptPrinter = clean(formData.get("receipt_printer_name"));
  const labelPrinter = clean(formData.get("label_printer_name"));
  const printerNotes = clean(formData.get("printer_notes"));

  if (!Number.isFinite(ownerShare) || ownerShare < 0 || ownerShare > 100) {
    redirect("/settings?error=Owner%20share%20must%20be%20between%200%20and%20100.");
  }

  if (!Number.isFinite(mechanicShare) || mechanicShare < 0 || mechanicShare > 100) {
    redirect("/settings?error=Mechanic%20share%20must%20be%20between%200%20and%20100.");
  }

  if (Math.abs(ownerShare + mechanicShare - 100) > 0.001) {
    redirect("/settings?error=Owner%20and%20mechanic%20shares%20must%20total%20100%25.");
  }

  if (!Number.isFinite(defaultReorderLevel) || defaultReorderLevel < 0) {
    redirect("/settings?error=Default%20reorder%20level%20cannot%20be%20negative.");
  }

  if (!["LETTER"].includes(receiptPaperSize)) {
    redirect("/settings?error=Invalid%20receipt%20paper%20size.");
  }

  if (!["PHP"].includes(currency)) {
    redirect("/settings?error=Invalid%20currency.");
  }

  if (!["Asia/Manila"].includes(timezone)) {
    redirect("/settings?error=Invalid%20timezone.");
  }

  const settings: Array<[string, string]> = [
    ["shop_name", shopName],
    ["shop_address", address],
    ["shop_contact", contact],
    ["shop_email", email],
    ["shop_tin", tin],
    ["receipt_footer", receiptFooter],

    ["default_owner_percentage", ownerShare.toFixed(2)],
    ["default_mechanic_percentage", mechanicShare.toFixed(2)],

    ["default_reorder_level", defaultReorderLevel.toFixed(2)],

    ["receipt_paper_size", receiptPaperSize],
    ["currency", currency],
    ["timezone", timezone],

    ["receipt_printer_name", receiptPrinter],
    ["label_printer_name", labelPrinter],
    ["printer_notes", printerNotes],
  ];

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const [key, value] of settings) {
      await connection.execute(
        `
          INSERT INTO system_settings (
            setting_key,
            setting_value,
            updated_by
          )
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            setting_value = VALUES(setting_value),
            updated_by = VALUES(updated_by),
            updated_at = CURRENT_TIMESTAMP
        `,
        [key, value, user.id],
      );
    }

    await connection.execute(
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
        VALUES (?, ?, ?, ?, 'Settings', 'system_settings', 'GENERAL')
      `,
      [
        user.id,
        user.fullName,
        user.role,
        "Updated system settings.",
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  redirect("/settings?success=Settings%20saved%20successfully.");
}
