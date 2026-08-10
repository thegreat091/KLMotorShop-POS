"use server";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface ProductRow extends RowDataPacket {
  id: number;
  product_code: string;
  product_name: string;
  selling_price: number;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: FormDataEntryValue | null): number {
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

async function logActivity(connection: PoolConnection, params: {
  userId: number;
  userName: string;
  userRole: string;
  action: string;
  referenceId: string;
}) {
  await connection.execute(
    `
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action,
        module, reference_table, reference_id
      ) VALUES (?, ?, ?, ?, 'Stock In', 'stock_transactions', ?)
    `,
    [params.userId, params.userName, params.userRole, params.action, params.referenceId],
  );
}

export async function createStockIn(formData: FormData) {
  const user = await requireInventoryManager();
  const supplierIdRaw = text(formData.get("supplier_id"));
  const supplierId = supplierIdRaw ? Number(supplierIdRaw) : null;
  const supplierReference = text(formData.get("supplier_reference"));
  const remarks = text(formData.get("remarks"));

  const productIds = formData.getAll("product_id").map((value) => Number(text(value)));
  const quantities = formData.getAll("quantity").map((value) => number(value));
  const unitCosts = formData.getAll("unit_cost").map((value) => number(value));
  const sellingPrices = formData.getAll("selling_price").map((value) => number(value));

  if (supplierId !== null && (!Number.isInteger(supplierId) || supplierId <= 0)) {
    redirect(redirectUrl("/inventory/stock-in/new", "error", "Invalid supplier."));
  }

  if (productIds.length === 0) {
    redirect(redirectUrl("/inventory/stock-in/new", "error", "Add at least one product."));
  }

  if (
    productIds.length !== quantities.length ||
    productIds.length !== unitCosts.length ||
    productIds.length !== sellingPrices.length
  ) {
    redirect(redirectUrl("/inventory/stock-in/new", "error", "Stock-in item data is incomplete."));
  }

  const seen = new Set<number>();
  for (let index = 0; index < productIds.length; index += 1) {
    const productId = productIds[index];
    const quantity = quantities[index];
    const unitCost = unitCosts[index];
    const sellingPrice = sellingPrices[index];

    if (!Number.isInteger(productId) || productId <= 0) {
      redirect(redirectUrl("/inventory/stock-in/new", "error", "Select a valid product for every line."));
    }
    if (seen.has(productId)) {
      redirect(redirectUrl("/inventory/stock-in/new", "error", "A product can only appear once per stock-in transaction."));
    }
    seen.add(productId);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      redirect(redirectUrl("/inventory/stock-in/new", "error", "Quantity must be a whole number greater than zero."));
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      redirect(redirectUrl("/inventory/stock-in/new", "error", "Unit cost must be zero or greater."));
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      redirect(redirectUrl("/inventory/stock-in/new", "error", "Selling price must be zero or greater."));
    }
  }

  const connection = await pool.getConnection();
  let createdStockInId = 0;
  try {
    await connection.beginTransaction();

    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await connection.query<ProductRow[]>(
      `
        SELECT id, product_code, product_name, selling_price
        FROM products
        WHERE id IN (${placeholders}) AND is_active = 1
        FOR UPDATE
      `,
      productIds,
    );

    if (products.length !== productIds.length) {
      throw new Error("One or more selected products are missing or inactive.");
    }

    const temporaryReference = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [headerResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO stock_transactions (
          reference_number, transaction_type, supplier_id,
          transaction_date, remarks, created_by
        ) VALUES (?, 'STOCK_IN', ?, NOW(), ?, ?)
      `,
      [temporaryReference, supplierId, remarks || null, user.id],
    );

    const stockInId = headerResult.insertId;
    const referenceNumber = `SI-${ymd()}-${String(stockInId).padStart(5, "0")}`;
    await connection.execute(
      `UPDATE stock_transactions SET reference_number = ? WHERE id = ?`,
      [referenceNumber, stockInId],
    );

    if (supplierReference) {
      await connection.execute(
        `INSERT INTO stock_in_meta (stock_transaction_id, supplier_reference) VALUES (?, ?)`,
        [stockInId, supplierReference],
      );
    }

    for (let index = 0; index < productIds.length; index += 1) {
      const productId = productIds[index];
      const quantity = quantities[index];
      const unitCost = unitCosts[index];
      const sellingPrice = sellingPrices[index];
      const product = products.find((row) => row.id === productId)!;
      const subtotal = quantity * unitCost;

      const [itemResult] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO stock_transaction_items (
            stock_transaction_id, product_id, quantity, unit_cost, subtotal
          ) VALUES (?, ?, ?, ?, ?)
        `,
        [stockInId, productId, quantity, unitCost, subtotal],
      );

      const lineNumber = index + 1;
      const batchNumber = `BAT-${ymd()}-${String(stockInId).padStart(5, "0")}-${String(lineNumber).padStart(2, "0")}`;
      const barcode = `KLB${ymd().slice(2)}${String(stockInId).padStart(5, "0")}${String(lineNumber).padStart(2, "0")}`;

      const [productState] = await connection.query<Array<RowDataPacket & { quantity_on_hand: number }>>(
        `SELECT quantity_on_hand FROM products WHERE id = ? FOR UPDATE`,
        [productId],
      );
      const oldBalance = Number(productState[0]?.quantity_on_hand ?? 0);
      const newBalance = oldBalance + quantity;

      await connection.execute(
        `
          INSERT INTO stock_in_batches (
            stock_transaction_id, stock_transaction_item_id, product_id,
            supplier_id, batch_number, barcode, quantity_received,
            quantity_remaining, unit_cost, selling_price, received_at,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ACTIVE')
        `,
        [
          stockInId,
          itemResult.insertId,
          productId,
          supplierId,
          batchNumber,
          barcode,
          quantity,
          quantity,
          unitCost,
          sellingPrice,
        ],
      );

      await connection.execute(
        `
          UPDATE products
          SET quantity_on_hand = ?, cost_price = ?, selling_price = ?,
              supplier_id = COALESCE(?, supplier_id), updated_by = ?
          WHERE id = ?
        `,
        [newBalance, unitCost, sellingPrice, supplierId, user.id, productId],
      );

      await connection.execute(
        `
          INSERT INTO inventory_movements (
            product_id, movement_type, reference_table, reference_id,
            quantity_in, quantity_out, balance_after, unit_cost,
            remarks, created_by
          ) VALUES (?, 'STOCK_IN', 'stock_transactions', ?, ?, 0, ?, ?, ?, ?)
        `,
        [
          productId,
          String(stockInId),
          quantity,
          newBalance,
          unitCost,
          `Stock in ${referenceNumber} / ${batchNumber}`,
          user.id,
        ],
      );

      void product;
    }

    await logActivity(connection, {
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: `Created stock-in ${referenceNumber} with ${productIds.length} product line${productIds.length === 1 ? "" : "s"}`,
      referenceId: String(stockInId),
    });

    await connection.commit();
    createdStockInId = stockInId;
  } catch (error) {
    await connection.rollback();
    console.error("Stock-in creation error:", error);
    const message = error instanceof Error ? error.message : "Unable to save stock-in transaction.";
    redirect(redirectUrl("/inventory/stock-in/new", "error", message));
  } finally {
    connection.release();
  }

  revalidatePath("/inventory/stock-in");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/inventory/stock-in/${createdStockInId}?success=${encodeURIComponent("Stock-in saved. Barcode labels are ready to print.")}`);
}
