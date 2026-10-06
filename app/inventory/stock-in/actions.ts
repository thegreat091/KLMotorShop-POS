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
  if (!["ADMIN", "OWNER", "INVENTORY"].includes(user.role)) redirect("/dashboard");
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


export type QuickProductActionState = {
  error: string;
  product?: {
    id: number;
    product_code: string;
    product_name: string;
    cost_price: number;
    selling_price: number;
    unit: string;
  };
};

export async function createQuickProduct(_previousState: QuickProductActionState, formData: FormData): Promise<QuickProductActionState> {
  const user = await requireInventoryManager();
  const productName = text(formData.get("product_name"));
  const barcode = text(formData.get("barcode"));
  const unit = (text(formData.get("unit")) || "PCS").toUpperCase();
  const categoryRaw = text(formData.get("category_id"));
  const categoryId = categoryRaw ? Number(categoryRaw) : null;

  if (!productName) return { error: "Product name is required." };
  if (productName.length > 180) return { error: "Product name must not exceed 180 characters." };
  if (barcode.length > 100) return { error: "QR value must not exceed 100 characters." };
  if (!unit || unit.length > 30) return { error: "Enter a valid unit." };
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) return { error: "Invalid category." };

  const [duplicates] = await pool.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM products WHERE LOWER(product_name) = LOWER(?) OR (? <> '' AND barcode = ?) LIMIT 1`,
    [productName, barcode, barcode],
  );
  if (duplicates.length) return { error: barcode ? "A product with this name or QR value already exists." : "A product with this name already exists." };

  const [codeRows] = await pool.query<(RowDataPacket & { next_number: number })[]>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(product_code, 5) AS UNSIGNED)), 0) + 1 AS next_number FROM products WHERE product_code LIKE 'PRD-%'`,
  );
  const productCode = `PRD-${String(Number(codeRows[0]?.next_number ?? 1)).padStart(6, "0")}`;
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO products (product_code, barcode, product_name, category_id, unit, cost_price, selling_price, quantity_on_hand, reorder_level, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 1, ?, ?)`,
    [productCode, barcode || null, productName, categoryId, unit, user.id, user.id],
  );

  await pool.execute(
    `INSERT INTO activity_logs (user_id, user_name, user_role, action, module, reference_table, reference_id) VALUES (?, ?, ?, ?, 'Products', 'products', ?)`,
    [user.id, user.fullName, user.role, `Created product ${productCode} - ${productName} from Stock In`, String(result.insertId)],
  );
  revalidatePath("/products");
  revalidatePath("/inventory/stock-in/new");
  return { error: "", product: { id: result.insertId, product_code: productCode, product_name: productName, cost_price: 0, selling_price: 0, unit } };
}

export type StockInActionState = { error: string };

export async function updateStockInSellingPrice(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "OWNER"].includes(user.role)) redirect("/dashboard");

  const stockInId = Number(text(formData.get("stock_in_id")));
  const batchId = Number(text(formData.get("batch_id")));
  const sellingPrice = number(formData.get("selling_price"));
  if (!Number.isInteger(stockInId) || stockInId <= 0 || !Number.isInteger(batchId) || batchId <= 0) {
    redirect(redirectUrl("/inventory/stock-in", "error", "Invalid Stock In record."));
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    redirect(redirectUrl(`/inventory/stock-in/${stockInId}`, "error", "Selling price must be zero or greater."));
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<Array<RowDataPacket & { product_id: number; batch_number: string; product_name: string }>>(
      `SELECT sib.product_id, sib.batch_number, p.product_name
       FROM stock_in_batches sib JOIN products p ON p.id=sib.product_id
       WHERE sib.id=? AND sib.stock_transaction_id=? LIMIT 1 FOR UPDATE`,
      [batchId, stockInId],
    );
    const batch = rows[0];
    if (!batch) throw new Error("Stock In batch was not found.");

    await connection.execute(`UPDATE stock_in_batches SET selling_price=? WHERE id=? AND stock_transaction_id=?`, [sellingPrice, batchId, stockInId]);
    // Keep the product's current selling price aligned with the latest Owner/Admin decision.
    await connection.execute(`UPDATE products SET selling_price=?, updated_by=? WHERE id=?`, [sellingPrice, user.id, batch.product_id]);
    await logActivity(connection, {
      userId: user.id, userName: user.fullName, userRole: user.role,
      action: `Updated selling price for ${batch.product_name} / ${batch.batch_number} to PHP ${sellingPrice.toFixed(2)}`,
      referenceId: String(stockInId),
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : "Unable to update selling price.";
    redirect(redirectUrl(`/inventory/stock-in/${stockInId}`, "error", message));
  } finally {
    connection.release();
  }
  revalidatePath(`/inventory/stock-in/${stockInId}`);
  revalidatePath(`/inventory/stock-in/${stockInId}/labels`);
  revalidatePath("/products");
  revalidatePath("/pos");
  redirect(redirectUrl(`/inventory/stock-in/${stockInId}`, "success", "Selling price updated."));
}

export async function createStockIn(_previousState: StockInActionState, formData: FormData): Promise<StockInActionState> {
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
    return { error: "Invalid supplier." };
  }

  if (productIds.length === 0) {
    return { error: "Add at least one product." };
  }

  if (
    productIds.length !== quantities.length ||
    productIds.length !== unitCosts.length ||
    productIds.length !== sellingPrices.length
  ) {
    return { error: "Stock-in item data is incomplete." };
  }

  const seen = new Set<number>();
  for (let index = 0; index < productIds.length; index += 1) {
    const productId = productIds[index];
    const quantity = quantities[index];
    const unitCost = unitCosts[index];
    const sellingPrice = sellingPrices[index];

    if (!Number.isInteger(productId) || productId <= 0) {
      return { error: `Select a valid product on line ${index + 1}. Your Stock In entries were kept.` };
    }
    if (seen.has(productId)) {
      return { error: `The product on line ${index + 1} was already added. Remove the duplicate and save again. Your Stock In entries were kept.` };
    }
    seen.add(productId);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      return { error: `Quantity on line ${index + 1} must be a whole number greater than zero. Your Stock In entries were kept.` };
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return { error: `Unit cost on line ${index + 1} must be zero or greater. Your Stock In entries were kept.` };
    }
    if (["ADMIN", "OWNER"].includes(user.role) && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) {
      return { error: `Selling price on line ${index + 1} must be zero or greater. Your Stock In entries were kept.` };
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
      const submittedSellingPrice = sellingPrices[index];
      const product = products.find((row) => row.id === productId)!;
      // Inventory can receive stock and enter purchase cost, but only Owner/Admin can decide selling price.
      const sellingPrice = ["ADMIN", "OWNER"].includes(user.role)
        ? submittedSellingPrice
        : Number(product.selling_price);
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
    return { error: `${message} Your Stock In entries were kept so you can correct the problem and try again.` };
  } finally {
    connection.release();
  }

  revalidatePath("/inventory/stock-in");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/inventory/stock-in/${createdStockInId}?success=${encodeURIComponent("Stock-in saved. QR code labels are ready to print.")}`);
}
