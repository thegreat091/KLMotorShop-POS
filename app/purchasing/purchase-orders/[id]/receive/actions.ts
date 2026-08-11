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

interface PORow extends RowDataPacket {
  id: number;
  po_number: string;
  supplier_id: number;
  status: string;
}

interface POItemRow extends RowDataPacket {
  id: number;
  product_id: number;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  selling_price: number;
  quantity_on_hand: number;
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function codeStamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

async function requireReceivingAccess() {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["ADMIN", "INVENTORY"].includes(user.role)) {
    redirect("/purchasing");
  }

  return user;
}

async function nextStockInReference(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      SELECT COALESCE(MAX(id), 0) + 1 AS next_no
      FROM stock_transactions
      WHERE transaction_type = 'STOCK_IN'
    `,
  );

  return `SI-${codeStamp()}-${String(rows[0]?.next_no ?? 1).padStart(5, "0")}`;
}

export async function receivePurchaseOrderAction(formData: FormData) {
  const user = await requireReceivingAccess();

  const purchaseOrderId = Number(clean(formData.get("purchase_order_id")));
  const supplierReference = clean(formData.get("supplier_reference"));
  const remarks = clean(formData.get("remarks"));

  const itemIds = formData
    .getAll("po_item_id")
    .map((value) => Number(String(value)));

  const quantities = formData
    .getAll("receive_quantity")
    .map((value) => Number(String(value)));

  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    redirect("/purchasing/purchase-orders?error=Invalid%20purchase%20order.");
  }

  const connection = await pool.getConnection();

  let stockTransactionId = 0;

  try {
    await connection.beginTransaction();

    const [poRows] = await connection.execute<PORow[]>(
      `
        SELECT id, po_number, supplier_id, status
        FROM purchase_orders
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [purchaseOrderId],
    );

    const po = poRows[0];

    if (!po) {
      throw new Error("Purchase order not found.");
    }

    if (["RECEIVED", "CANCELLED"].includes(po.status)) {
      throw new Error(
        po.status === "RECEIVED"
          ? "This purchase order has already been fully received."
          : "Cancelled purchase orders cannot be received.",
      );
    }

    const [poItems] = await connection.execute<POItemRow[]>(
      `
        SELECT
          poi.id,
          poi.product_id,
          poi.quantity_ordered,
          poi.quantity_received,
          poi.unit_cost,
          p.selling_price,
          p.quantity_on_hand
        FROM purchase_order_items poi
        JOIN products p ON p.id = poi.product_id
        WHERE poi.purchase_order_id = ?
        ORDER BY poi.id
        FOR UPDATE
      `,
      [purchaseOrderId],
    );

    const requested = new Map<number, number>();

    itemIds.forEach((id, index) => {
      if (Number.isInteger(id) && id > 0) {
        requested.set(id, Number(quantities[index] ?? 0));
      }
    });

    const receiveItems = poItems
      .map((item) => {
        const qty = Number(requested.get(item.id) ?? 0);
        const remaining =
          Number(item.quantity_ordered) - Number(item.quantity_received);

        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error("Received quantities cannot be negative.");
        }

        if (qty > remaining + 0.0001) {
          throw new Error(
            `Received quantity cannot exceed the remaining ordered quantity.`,
          );
        }

        return {
          ...item,
          receiveQty: qty,
          remaining,
        };
      })
      .filter((item) => item.receiveQty > 0);

    if (!receiveItems.length) {
      throw new Error("Enter a received quantity for at least one item.");
    }

    const referenceNumber = await nextStockInReference(connection);

    const [stockResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO stock_transactions (
          reference_number,
          transaction_type,
          supplier_id,
          transaction_date,
          remarks,
          created_by
        )
        VALUES (?, 'STOCK_IN', ?, CURRENT_TIMESTAMP, ?, ?)
      `,
      [
        referenceNumber,
        po.supplier_id,
        `PO ${po.po_number}${remarks ? ` - ${remarks}` : ""}`,
        user.id,
      ],
    );

    stockTransactionId = stockResult.insertId;

    await connection.execute(
      `
        INSERT INTO stock_in_meta (
          stock_transaction_id,
          supplier_reference,
          purchase_order_id
        )
        VALUES (?, ?, ?)
      `,
      [
        stockTransactionId,
        supplierReference || po.po_number,
        purchaseOrderId,
      ],
    );

    let batchCounter = 1;

    for (const item of receiveItems) {
      const subtotal = item.receiveQty * Number(item.unit_cost);

      const [stockItemResult] =
        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO stock_transaction_items (
              stock_transaction_id,
              product_id,
              quantity,
              unit_cost,
              subtotal
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            stockTransactionId,
            item.product_id,
            item.receiveQty.toFixed(2),
            Number(item.unit_cost).toFixed(2),
            subtotal.toFixed(2),
          ],
        );

      const batchNumber =
        `BAT-${codeStamp()}-${item.product_id}-${String(batchCounter).padStart(2, "0")}`;

      const barcode =
        `KLB${codeStamp()}${item.product_id}${String(batchCounter).padStart(2, "0")}`;

      batchCounter += 1;

      await connection.execute(
        `
          INSERT INTO stock_in_batches (
            stock_transaction_id,
            stock_transaction_item_id,
            product_id,
            supplier_id,
            batch_number,
            barcode,
            quantity_received,
            quantity_remaining,
            unit_cost,
            selling_price,
            received_at,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ACTIVE')
        `,
        [
          stockTransactionId,
          stockItemResult.insertId,
          item.product_id,
          po.supplier_id,
          batchNumber,
          barcode,
          item.receiveQty.toFixed(2),
          item.receiveQty.toFixed(2),
          Number(item.unit_cost).toFixed(2),
          Number(item.selling_price).toFixed(2),
        ],
      );

      const newBalance =
        Number(item.quantity_on_hand) + item.receiveQty;

      await connection.execute(
        `
          UPDATE products
          SET
            quantity_on_hand = ?,
            cost_price = ?,
            updated_by = ?
          WHERE id = ?
        `,
        [
          newBalance.toFixed(2),
          Number(item.unit_cost).toFixed(2),
          user.id,
          item.product_id,
        ],
      );

      await connection.execute(
        `
          INSERT INTO inventory_movements (
            product_id,
            movement_type,
            reference_table,
            reference_id,
            quantity_in,
            quantity_out,
            balance_after,
            unit_cost,
            remarks,
            created_by,
            created_at
          )
          VALUES (
            ?,
            'STOCK_IN',
            'stock_transactions',
            ?,
            ?,
            0.00,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `,
        [
          item.product_id,
          String(stockTransactionId),
          item.receiveQty.toFixed(2),
          newBalance.toFixed(2),
          Number(item.unit_cost).toFixed(2),
          `Stock in ${referenceNumber} from Purchase Order ${po.po_number}`,
          user.id,
        ],
      );

      await connection.execute(
        `
          UPDATE purchase_order_items
          SET quantity_received = quantity_received + ?
          WHERE id = ?
        `,
        [item.receiveQty.toFixed(2), item.id],
      );
    }

    const [remainingRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS remaining_items
        FROM purchase_order_items
        WHERE purchase_order_id = ?
          AND quantity_received + 0.0001 < quantity_ordered
      `,
      [purchaseOrderId],
    );

    const remainingItems = Number(
      remainingRows[0]?.remaining_items ?? 0,
    );

    await connection.execute(
      `
        UPDATE purchase_orders
        SET status = ?
        WHERE id = ?
      `,
      [
        remainingItems === 0 ? "RECEIVED" : "PARTIALLY_RECEIVED",
        purchaseOrderId,
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
        VALUES (?, ?, ?, ?, 'Purchasing', 'purchase_orders', ?)
      `,
      [
        user.id,
        user.fullName,
        user.role,
        `Received stock for ${po.po_number} under Stock In ${referenceNumber}.`,
        String(purchaseOrderId),
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    const message =
      error instanceof Error
        ? error.message
        : "Unable to receive purchase order.";

    redirect(
      `/purchasing/purchase-orders/${purchaseOrderId}/receive?error=${encodeURIComponent(
        message,
      )}`,
    );
  } finally {
    connection.release();
  }

  revalidatePath(`/purchasing/purchase-orders/${purchaseOrderId}`);
  revalidatePath(`/purchasing/purchase-orders/${purchaseOrderId}/receive`);
  revalidatePath("/purchasing/purchase-orders");
  revalidatePath("/purchasing/reorder");
  revalidatePath("/inventory/stock-in");
  revalidatePath("/inventory/stock-inquiry");

  redirect(`/inventory/stock-in/${stockTransactionId}/labels`);
}
