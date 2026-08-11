"use server";

import type { RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface ExistingRow extends RowDataPacket {
  id: number;
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function initializeOpeningBalanceAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "OWNER") {
    redirect(
      "/financial-setup?error=Only%20the%20Owner%20can%20initialize%20the%20opening%20balance.",
    );
  }

  const amount = Number(clean(formData.get("opening_balance")));
  const remarks =
    clean(formData.get("remarks")) || "Initial business opening balance";

  if (!Number.isFinite(amount) || amount < 0) {
    redirect(
      "/financial-setup?error=Opening%20balance%20must%20be%20zero%20or%20greater.",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query<ExistingRow[]>(
      `
        SELECT id
        FROM financial_settings
        WHERE id = 1
        LIMIT 1
        FOR UPDATE
      `,
    );

    if (existing.length > 0) {
      throw new Error(
        "The financial opening balance has already been initialized.",
      );
    }

    await connection.execute(
      `
        INSERT INTO financial_settings (
          id,
          opening_balance,
          remarks,
          initialized_by,
          initialized_at
        )
        VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [amount.toFixed(2), remarks, user.id],
    );

    await connection.execute(
      `
        INSERT INTO money_ledger (
          entry_date,
          entry_type,
          reference_table,
          reference_id,
          description,
          payment_method,
          amount_in,
          amount_out,
          processed_by,
          remarks
        )
        VALUES (
          CURRENT_TIMESTAMP,
          'OPENING_BALANCE',
          'financial_settings',
          '1',
          'Business Opening Balance',
          'CASH',
          ?,
          0.00,
          ?,
          ?
        )
      `,
      [amount.toFixed(2), user.id, remarks],
    );

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
        VALUES (
          ?, ?, ?, ?,
          'Finance',
          'financial_settings',
          '1'
        )
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Initialized business opening balance at PHP ${amount.toFixed(2)}.`,
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    const message =
      error instanceof Error
        ? error.message
        : "Unable to initialize opening balance.";

    redirect(`/financial-setup?error=${encodeURIComponent(message)}`);
  } finally {
    connection.release();
  }

  revalidatePath("/financial-setup");
  revalidatePath("/money-ledger");
  revalidatePath("/dashboard");

  redirect("/money-ledger?success=Opening%20balance%20initialized.");
}
