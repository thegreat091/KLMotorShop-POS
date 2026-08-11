"use server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface EarningRow extends RowDataPacket {
  id: number;
  mechanic_id: number;
  mechanic_share: number;
  payout_status: "UNPAID" | "PAID";
  payout_id: number | null;
}

interface PayoutNoRow extends RowDataPacket {
  next_no: number;
}

interface AdvanceRow extends RowDataPacket {
  id: number;
  amount: number;
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function requireCashier() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (!["ADMIN", "CASHIER"].includes(user.role)) {
    redirect(
      "/mechanic-payouts?error=Only%20the%20Cashier%20can%20process%20mechanic%20payouts.",
    );
  }

  return user;
}

async function nextPayoutNumber(connection: PoolConnection) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  const date =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

  const [rows] = await connection.execute<PayoutNoRow[]>(
    `
      SELECT COALESCE(MAX(id), 0) + 1 AS next_no
      FROM mechanic_payouts
    `,
  );

  return `MP-${date}-${String(rows[0]?.next_no ?? 1).padStart(5, "0")}`;
}

export async function payMechanicAction(formData: FormData) {
  const user = await requireCashier();

  const mechanicId = Number(clean(formData.get("mechanic_id")));
  const paymentMethod = clean(formData.get("payment_method"));
  const remarks = clean(formData.get("remarks"));

  const earningIds = formData
    .getAll("earning_id")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
    redirect("/mechanic-payouts?error=Select%20a%20mechanic.");
  }

  if (!["CASH", "GCASH", "BANK_TRANSFER", "OTHER"].includes(paymentMethod)) {
    redirect(
      `/mechanic-payouts?mechanic=${mechanicId}&error=Select%20a%20valid%20payment%20method.`,
    );
  }

  if (earningIds.length === 0) {
    redirect(
      `/mechanic-payouts?mechanic=${mechanicId}&error=Select%20at%20least%20one%20unpaid%20earning.`,
    );
  }

  const connection = await pool.getConnection();

  let payoutId = 0;

  try {
    await connection.beginTransaction();

    const placeholders = earningIds.map(() => "?").join(",");

    const [earnings] = await connection.execute<EarningRow[]>(
      `
        SELECT
          id,
          mechanic_id,
          mechanic_share,
          payout_status,
          payout_id
        FROM mechanic_earnings
        WHERE id IN (${placeholders})
        FOR UPDATE
      `,
      earningIds,
    );

    if (earnings.length !== earningIds.length) {
      throw new Error("One or more selected mechanic earnings were not found.");
    }

    for (const earning of earnings) {
      if (Number(earning.mechanic_id) !== mechanicId) {
        throw new Error("Selected earnings must belong to one mechanic.");
      }

      if (earning.payout_status !== "UNPAID" || earning.payout_id) {
        throw new Error(
          "One or more selected earnings have already been paid.",
        );
      }
    }

    const total = earnings.reduce(
      (sum, row) => sum + Number(row.mechanic_share),
      0,
    );

    if (total <= 0) {
      throw new Error("Payout total must be greater than zero.");
    }

    const [advanceRows] = await connection.execute<AdvanceRow[]>(
      `
        SELECT id, amount
        FROM mechanic_cash_advances
        WHERE mechanic_id = ? AND status = 'OPEN'
        ORDER BY advance_date ASC, id ASC
        FOR UPDATE
      `,
      [mechanicId],
    );

    const totalAdvance = advanceRows.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );

    const netPayout = Math.max(0, total - totalAdvance);
    const advanceApplied = Math.min(total, totalAdvance);

    const payoutNumber = await nextPayoutNumber(connection);

    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO mechanic_payouts (
          payout_number,
          mechanic_id,
          total_amount,
          payment_method,
          remarks,
          processed_by,
          paid_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        payoutNumber,
        mechanicId,
        netPayout.toFixed(2),
        paymentMethod,
        remarks || null,
        user.id,
      ],
    );

    payoutId = result.insertId;

    for (const earning of earnings) {
      await connection.execute(
        `
          INSERT INTO mechanic_payout_items (
            payout_id,
            mechanic_earning_id,
            amount
          )
          VALUES (?, ?, ?)
        `,
        [
          payoutId,
          earning.id,
          Number(earning.mechanic_share).toFixed(2),
        ],
      );
    }

    await connection.execute(
      `
        UPDATE mechanic_earnings
        SET
          payout_status = 'PAID',
          payout_id = ?,
          paid_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `,
      [payoutId, ...earningIds],
    );

    if (advanceApplied > 0) {
      let remaining = advanceApplied;

      for (const advance of advanceRows) {
        if (remaining <= 0) break;

        const applied = Math.min(remaining, Number(advance.amount));
        remaining -= applied;

        if (applied >= Number(advance.amount)) {
          await connection.execute(
            `
              UPDATE mechanic_cash_advances
              SET
                status = 'DEDUCTED',
                payout_id = ?,
                deducted_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [payoutId, advance.id],
          );
        } else {
          // Partial advance: close current row and create a new OPEN remainder.
          const balance = Number(advance.amount) - applied;

          await connection.execute(
            `
              UPDATE mechanic_cash_advances
              SET
                amount = ?,
                status = 'DEDUCTED',
                payout_id = ?,
                deducted_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [applied.toFixed(2), payoutId, advance.id],
          );

          await connection.execute(
            `
              INSERT INTO mechanic_cash_advances (
                advance_number,
                mechanic_id,
                advance_date,
                amount,
                payment_method,
                reason,
                status,
                processed_by
              )
              SELECT
                CONCAT(advance_number, '-BAL'),
                mechanic_id,
                CURRENT_TIMESTAMP,
                ?,
                payment_method,
                CONCAT('Remaining balance from ', advance_number),
                'OPEN',
                processed_by
              FROM mechanic_cash_advances
              WHERE id = ?
            `,
            [balance.toFixed(2), advance.id],
          );
        }
      }
    }

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
          'MECHANIC_PAYOUT',
          'mechanic_payouts',
          ?,
          ?,
          ?,
          0.00,
          ?,
          ?,
          ?
        )
      `,
      [
        String(payoutId),
        `Mechanic payout ${payoutNumber}`,
        paymentMethod,
        netPayout.toFixed(2),
        user.id,
        remarks || null,
      ],
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
          'Mechanic Payouts',
          'mechanic_payouts',
          ?
        )
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Paid mechanic earnings totaling PHP ${total.toFixed(2)} under ${payoutNumber}; cash advance deduction PHP ${advanceApplied.toFixed(2)}; net payout PHP ${netPayout.toFixed(2)}.`,
        String(payoutId),
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    const message =
      error instanceof Error
        ? error.message
        : "Unable to process mechanic payout.";

    // Redirect is intentionally outside the main success path below,
    // so NEXT_REDIRECT is never caught as an ordinary error.
    redirect(
      `/mechanic-payouts?mechanic=${mechanicId}&error=${encodeURIComponent(
        message,
      )}`,
    );
  } finally {
    connection.release();
  }

  // IMPORTANT:
  // Keep redirect outside try/catch.
  // Next.js implements redirect() by throwing an internal redirect signal.
  revalidatePath("/mechanic-payouts");
  revalidatePath("/money-ledger");
  revalidatePath("/reports/mechanic-earnings");
  revalidatePath("/mechanic-cash-advances");

  redirect(`/mechanic-payouts/${payoutId}/print`);
}
