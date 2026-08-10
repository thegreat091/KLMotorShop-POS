"use server";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface BatchRow extends RowDataPacket {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  batch_number: string;
  barcode: string;
  quantity_remaining: number;
  unit_cost: number;
  status: "ACTIVE" | "DEPLETED" | "CANCELLED";
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function wholeNumber(value: FormDataEntryValue | null): number {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function requireInventoryManager() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "INVENTORY") redirect("/dashboard");
  return user;
}

function redirectUrl(path: string, type: "success" | "error", message: string) {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

function ymd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function logActivity(
  connection: PoolConnection,
  params: {
    userId: number;
    userName: string;
    userRole: string;
    action: string;
    referenceId: string;
  },
) {
  await connection.execute(
    `
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action,
        module, reference_table, reference_id
      ) VALUES (?, ?, ?, ?, 'Inventory', 'stock_transactions', ?)
    `,
    [params.userId, params.userName, params.userRole, params.action, params.referenceId],
  );
}

export async function createInventoryAdjustment(formData: FormData) {
  const user = await requireInventoryManager();

  const transactionType = text(formData.get("transaction_type"));
  const batchId = Number(text(formData.get("batch_id")));
  const quantity = wholeNumber(formData.get("quantity"));
  const reason = text(formData.get("reason"));
  const remarks = text(formData.get("remarks"));

  if (!['STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(transactionType)) {
    redirect(redirectUrl("/inventory/stock-adjustments/new", "error", "Select a valid transaction type."));
  }

  if (!Number.isInteger(batchId) || batchId <= 0) {
    redirect(redirectUrl("/inventory/stock-adjustments/new", "error", "Select a valid product batch."));
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    redirect(redirectUrl("/inventory/stock-adjustments/new", "error", "Quantity must be a whole number greater than zero."));
  }

  if (!reason) {
    redirect(redirectUrl("/inventory/stock-adjustments/new", "error", "Reason is required for inventory adjustments."));
  }

  const connection = await pool.getConnection();
  let createdId = 0;

  try {
    await connection.beginTransaction();

    const [batches] = await connection.query<BatchRow[]>(
      `
        SELECT
          sib.id,
          sib.product_id,
          p.product_code,
          p.product_name,
          sib.batch_number,
          sib.barcode,
          sib.quantity_remaining,
          sib.unit_cost,
          sib.status
        FROM stock_in_batches sib
        JOIN products p ON p.id = sib.product_id
        WHERE sib.id = ?
          AND sib.status <> 'CANCELLED'
          AND p.is_active = 1
        LIMIT 1
        FOR UPDATE
      `,
      [batchId],
    );

    const batch = batches[0];
    if (!batch) {
      throw new Error("The selected batch no longer exists or is unavailable.");
    }

    const isIncrease = transactionType === "ADJUSTMENT_IN";
    const currentBatchQty = Number(batch.quantity_remaining);

    if (!isIncrease && quantity > currentBatchQty) {
      throw new Error(`Only ${currentBatchQty} item(s) remain in batch ${batch.batch_number}.`);
    }

    const [productRows] = await connection.query<Array<RowDataPacket & { quantity_on_hand: number }>>(
      `SELECT quantity_on_hand FROM products WHERE id = ? LIMIT 1 FOR UPDATE`,
      [batch.product_id],
    );

    const currentProductQty = Number(productRows[0]?.quantity_on_hand ?? 0);
    if (!isIncrease && quantity > currentProductQty) {
      throw new Error(`Product stock is only ${currentProductQty}. The transaction cannot continue.`);
    }

    const newBatchQty = isIncrease
      ? currentBatchQty + quantity
      : currentBatchQty - quantity;
    const newProductQty = isIncrease
      ? currentProductQty + quantity
      : currentProductQty - quantity;

    const temporaryReference = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const note = remarks ? `${reason} — ${remarks}` : reason;

    const [headerResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO stock_transactions (
          reference_number, transaction_type, supplier_id,
          transaction_date, remarks, created_by
        ) VALUES (?, ?, NULL, NOW(), ?, ?)
      `,
      [temporaryReference, transactionType, note, user.id],
    );

    const transactionId = headerResult.insertId;
    const prefix = transactionType === "STOCK_OUT" ? "SO" : "ADJ";
    const referenceNumber = `${prefix}-${ymd()}-${String(transactionId).padStart(5, "0")}`;

    await connection.execute(
      `UPDATE stock_transactions SET reference_number = ? WHERE id = ?`,
      [referenceNumber, transactionId],
    );

    await connection.execute(
      `
        INSERT INTO stock_transaction_items (
          stock_transaction_id, product_id, quantity, unit_cost, subtotal
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        transactionId,
        batch.product_id,
        quantity,
        Number(batch.unit_cost),
        quantity * Number(batch.unit_cost),
      ],
    );

    await connection.execute(
      `
        UPDATE stock_in_batches
        SET quantity_remaining = ?,
            status = CASE WHEN ? <= 0 THEN 'DEPLETED' ELSE 'ACTIVE' END
        WHERE id = ?
      `,
      [newBatchQty, newBatchQty, batch.id],
    );

    await connection.execute(
      `
        UPDATE products
        SET quantity_on_hand = ?, updated_by = ?
        WHERE id = ?
      `,
      [newProductQty, user.id, batch.product_id],
    );

    await connection.execute(
      `
        INSERT INTO inventory_movements (
          product_id, movement_type, reference_table, reference_id,
          quantity_in, quantity_out, balance_after, unit_cost,
          remarks, created_by
        ) VALUES (?, ?, 'stock_transactions', ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        batch.product_id,
        transactionType,
        String(transactionId),
        isIncrease ? quantity : 0,
        isIncrease ? 0 : quantity,
        newProductQty,
        Number(batch.unit_cost),
        `${reason} / ${batch.batch_number}${remarks ? ` / ${remarks}` : ""}`,
        user.id,
      ],
    );

    const actionLabel =
      transactionType === "STOCK_OUT"
        ? "Stocked out"
        : transactionType === "ADJUSTMENT_IN"
          ? "Adjusted stock in"
          : "Adjusted stock out";

    await logActivity(connection, {
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: `${actionLabel} ${quantity} ${batch.product_name} from batch ${batch.batch_number} (${referenceNumber})`,
      referenceId: String(transactionId),
    });

    await connection.commit();
    createdId = transactionId;
  } catch (error) {
    await connection.rollback();
    console.error("Inventory adjustment error:", error);
    const message = error instanceof Error ? error.message : "Unable to save inventory transaction.";
    redirect(redirectUrl("/inventory/stock-adjustments/new", "error", message));
  } finally {
    connection.release();
  }

  revalidatePath("/inventory/stock-adjustments");
  revalidatePath("/inventory/stock-in");
  revalidatePath("/products");
  revalidatePath("/dashboard");

  redirect(
    `/inventory/stock-adjustments?success=${encodeURIComponent(`Inventory transaction #${createdId} saved successfully.`)}`,
  );
}
