"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

async function requirePurchasingAccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "OWNER", "INVENTORY"].includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

async function nextPoNumber(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT COALESCE(MAX(id),0)+1 AS next_no FROM purchase_orders",
  );
  const now = new Date();
  const pad = (n:number)=>String(n).padStart(2,"0");
  return `PO-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(rows[0]?.next_no ?? 1).padStart(5,"0")}`;
}

export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requirePurchasingAccess();

  const supplierId = Number(clean(formData.get("supplier_id")));
  const expectedDate = clean(formData.get("expected_date"));
  const remarks = clean(formData.get("remarks"));

  const productIds = formData.getAll("product_id").map(v => Number(String(v)));
  const quantities = formData.getAll("quantity").map(v => Number(String(v)));
  const unitCosts = formData.getAll("unit_cost").map(v => Number(String(v)));

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    redirect("/purchasing/purchase-orders/new?error=Select%20a%20supplier.");
  }

  const items = productIds
    .map((productId, i) => ({
      productId,
      quantity: quantities[i],
      unitCost: unitCosts[i],
    }))
    .filter(x =>
      Number.isInteger(x.productId) &&
      x.productId > 0 &&
      Number.isFinite(x.quantity) &&
      x.quantity > 0 &&
      Number.isFinite(x.unitCost) &&
      x.unitCost >= 0
    );

  if (!items.length) {
    redirect("/purchasing/purchase-orders/new?error=Add%20at%20least%20one%20valid%20item.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const poNumber = await nextPoNumber(connection);
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO purchase_orders (
          po_number,
          supplier_id,
          order_date,
          expected_date,
          status,
          total_amount,
          remarks,
          created_by
        )
        VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'ORDERED', ?, ?, ?)
      `,
      [
        poNumber,
        supplierId,
        expectedDate || null,
        total.toFixed(2),
        remarks || null,
        user.id,
      ],
    );

    for (const item of items) {
      await connection.execute(
        `
          INSERT INTO purchase_order_items (
            purchase_order_id,
            product_id,
            quantity_ordered,
            quantity_received,
            unit_cost,
            line_total
          )
          VALUES (?, ?, ?, 0.00, ?, ?)
        `,
        [
          result.insertId,
          item.productId,
          item.quantity.toFixed(2),
          item.unitCost.toFixed(2),
          (item.quantity * item.unitCost).toFixed(2),
        ],
      );
    }

    await connection.execute(
      `
        INSERT INTO activity_logs (
          user_id,user_name,user_role,action,module,reference_table,reference_id
        )
        VALUES (?, ?, ?, ?, 'Purchasing', 'purchase_orders', ?)
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Created purchase order ${poNumber}.`,
        String(result.insertId),
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : "Unable to create purchase order.";
    redirect(`/purchasing/purchase-orders/new?error=${encodeURIComponent(message)}`);
  } finally {
    connection.release();
  }

  revalidatePath("/purchasing");
  revalidatePath("/purchasing/purchase-orders");
  revalidatePath("/purchasing/reorder");
  redirect("/purchasing/purchase-orders?success=Purchase%20order%20created.");
}
