"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextProductCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingProductRow extends RowDataPacket {
  id: number;
}

function getText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalId(formData: FormData, fieldName: string): number | null {
  const value = Number(getText(formData, fieldName));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getMoney(formData: FormData, fieldName: string): number {
  const rawValue = getText(formData, fieldName);
  if (!rawValue) return 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : Number.NaN;
}

function buildRedirectUrl(
  path: string,
  type: "success" | "error",
  message: string,
): string {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

async function requireProductViewer() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (
    user.role !== "ADMIN" &&
    user.role !== "OWNER" &&
    user.role !== "CASHIER" &&
    user.role !== "INVENTORY"
  ) {
    redirect("/dashboard");
  }

  return user;
}

async function requireProductManager() {
  const user = await requireProductViewer();

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/products");
  }

  return user;
}

async function generateProductCode(): Promise<string> {
  const [rows] = await pool.query<NextProductCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(CAST(SUBSTRING(product_code, 5) AS UNSIGNED)),
          0
        ) + 1 AS next_number
      FROM products
      WHERE product_code LIKE 'PRD-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);
  return `PRD-${String(nextNumber).padStart(6, "0")}`;
}

async function writeActivityLog(parameters: {
  userId: number;
  userName: string;
  userRole: string;
  action: string;
  referenceId?: string | null;
}) {
  await pool.execute(
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
      VALUES (?, ?, ?, ?, 'Products', 'products', ?)
    `,
    [
      parameters.userId,
      parameters.userName,
      parameters.userRole,
      parameters.action,
      parameters.referenceId ?? null,
    ],
  );
}

function validateProduct(parameters: {
  productName: string;
  barcode: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
}): string | null {
  if (!parameters.productName) return "Product name is required.";
  if (parameters.productName.length > 180) {
    return "Product name must not exceed 180 characters.";
  }
  if (parameters.barcode.length > 100) {
    return "Barcode must not exceed 100 characters.";
  }
  if (!parameters.unit) return "Unit is required.";
  if (parameters.unit.length > 30) {
    return "Unit must not exceed 30 characters.";
  }
  if (!Number.isFinite(parameters.costPrice) || parameters.costPrice < 0) {
    return "Cost price must be zero or greater.";
  }
  if (!Number.isFinite(parameters.sellingPrice) || parameters.sellingPrice < 0) {
    return "Selling price must be zero or greater.";
  }
  if (!Number.isFinite(parameters.reorderLevel) || parameters.reorderLevel < 0) {
    return "Reorder level must be zero or greater.";
  }
  return null;
}

export async function createProduct(formData: FormData) {
  const user = await requireProductManager();

  const productName = getText(formData, "product_name");
  const barcode = getText(formData, "barcode");
  const categoryId = getOptionalId(formData, "category_id");
  const brandId = getOptionalId(formData, "brand_id");
  const supplierId = getOptionalId(formData, "supplier_id");
  const description = getText(formData, "description");
  const unit = getText(formData, "unit") || "PCS";
  const costPrice = getMoney(formData, "cost_price");
  const sellingPrice = getMoney(formData, "selling_price");
  const reorderLevel = getMoney(formData, "reorder_level");
  const isActive = getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateProduct({
    productName,
    barcode,
    unit,
    costPrice,
    sellingPrice,
    reorderLevel,
  });

  if (validationError) {
    redirect(buildRedirectUrl("/products/new", "error", validationError));
  }

  const [duplicates] = await pool.execute<ExistingProductRow[]>(
    `
      SELECT id
      FROM products
      WHERE LOWER(product_name) = LOWER(?)
         OR (? <> '' AND barcode = ?)
      LIMIT 1
    `,
    [productName, barcode, barcode],
  );

  if (duplicates.length > 0) {
    redirect(
      buildRedirectUrl(
        "/products/new",
        "error",
        barcode
          ? "A product with this name or barcode already exists."
          : "A product with this name already exists.",
      ),
    );
  }

  const productCode = await generateProductCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO products (
        product_code,
        barcode,
        product_name,
        category_id,
        brand_id,
        supplier_id,
        description,
        unit,
        cost_price,
        selling_price,
        quantity_on_hand,
        reorder_level,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `,
    [
      productCode,
      barcode || null,
      productName,
      categoryId,
      brandId,
      supplierId,
      description || null,
      unit.toUpperCase(),
      costPrice,
      sellingPrice,
      reorderLevel,
      isActive,
      user.id,
      user.id,
    ],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Created product ${productCode} - ${productName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");

  redirect(buildRedirectUrl("/products", "success", "Product created successfully."));
}

export async function updateProduct(productId: number, formData: FormData) {
  const user = await requireProductManager();

  if (!Number.isInteger(productId) || productId <= 0) {
    redirect(buildRedirectUrl("/products", "error", "Invalid product."));
  }

  const productName = getText(formData, "product_name");
  const barcode = getText(formData, "barcode");
  const categoryId = getOptionalId(formData, "category_id");
  const brandId = getOptionalId(formData, "brand_id");
  const supplierId = getOptionalId(formData, "supplier_id");
  const description = getText(formData, "description");
  const unit = getText(formData, "unit") || "PCS";
  const costPrice = getMoney(formData, "cost_price");
  const sellingPrice = getMoney(formData, "selling_price");
  const reorderLevel = getMoney(formData, "reorder_level");
  const isActive = getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateProduct({
    productName,
    barcode,
    unit,
    costPrice,
    sellingPrice,
    reorderLevel,
  });

  if (validationError) {
    redirect(buildRedirectUrl(`/products/${productId}`, "error", validationError));
  }

  const [duplicates] = await pool.execute<ExistingProductRow[]>(
    `
      SELECT id
      FROM products
      WHERE id <> ?
        AND (
          LOWER(product_name) = LOWER(?)
          OR (? <> '' AND barcode = ?)
        )
      LIMIT 1
    `,
    [productId, productName, barcode, barcode],
  );

  if (duplicates.length > 0) {
    redirect(
      buildRedirectUrl(
        `/products/${productId}`,
        "error",
        barcode
          ? "Another product already uses this name or barcode."
          : "Another product already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE products
      SET
        barcode = ?,
        product_name = ?,
        category_id = ?,
        brand_id = ?,
        supplier_id = ?,
        description = ?,
        unit = ?,
        cost_price = ?,
        selling_price = ?,
        reorder_level = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
    `,
    [
      barcode || null,
      productName,
      categoryId,
      brandId,
      supplierId,
      description || null,
      unit.toUpperCase(),
      costPrice,
      sellingPrice,
      reorderLevel,
      isActive,
      user.id,
      productId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(buildRedirectUrl("/products", "error", "Product not found."));
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated product ${productName}`,
    referenceId: String(productId),
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");

  redirect(buildRedirectUrl("/products", "success", "Product updated successfully."));
}

export async function toggleProductStatus(productId: number) {
  const user = await requireProductManager();

  if (!Number.isInteger(productId) || productId <= 0) {
    redirect(buildRedirectUrl("/products", "error", "Invalid product."));
  }

  const [products] = await pool.execute<
    Array<ExistingProductRow & { product_code: string; product_name: string; is_active: number }>
  >(
    `
      SELECT id, product_code, product_name, is_active
      FROM products
      WHERE id = ?
      LIMIT 1
    `,
    [productId],
  );

  const product = products[0];

  if (!product) {
    redirect(buildRedirectUrl("/products", "error", "Product not found."));
  }

  const nextStatus = product.is_active === 1 ? 0 : 1;

  await pool.execute(
    `UPDATE products SET is_active = ?, updated_by = ? WHERE id = ?`,
    [nextStatus, user.id, productId],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `${nextStatus === 1 ? "Activated" : "Deactivated"} product ${product.product_code} - ${product.product_name}`,
    referenceId: String(productId),
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");
}
