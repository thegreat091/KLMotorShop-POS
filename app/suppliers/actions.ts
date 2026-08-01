"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextSupplierCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingSupplierRow extends RowDataPacket {
  id: number;
}

interface SupplierInformationRow extends RowDataPacket {
  supplier_code: string;
  supplier_name: string;
}

function getText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

function buildRedirectUrl(
  path: string,
  type: "success" | "error",
  message: string,
): string {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

async function requireSupplierViewer() {
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

async function requireSupplierManager() {
  const user = await requireSupplierViewer();

  if (
    user.role !== "ADMIN" &&
    user.role !== "INVENTORY"
  ) {
    redirect("/suppliers");
  }

  return user;
}

async function generateSupplierCode(): Promise<string> {
  const [rows] = await pool.query<NextSupplierCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(supplier_code, 5)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM suppliers
      WHERE supplier_code LIKE 'SUP-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `SUP-${String(nextNumber).padStart(6, "0")}`;
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      parameters.userId,
      parameters.userName,
      parameters.userRole,
      parameters.action,
      "Suppliers",
      "suppliers",
      parameters.referenceId ?? null,
    ],
  );
}

function validateSupplier(parameters: {
  supplierName: string;
  contactPerson: string;
  mobileNumber: string;
  telephoneNumber: string;
}): string | null {
  if (!parameters.supplierName) {
    return "Supplier name is required.";
  }

  if (parameters.supplierName.length > 150) {
    return "Supplier name must not exceed 150 characters.";
  }

  if (parameters.contactPerson.length > 150) {
    return "Contact person must not exceed 150 characters.";
  }

  if (parameters.mobileNumber.length > 50) {
    return "Mobile number must not exceed 50 characters.";
  }

  if (parameters.telephoneNumber.length > 50) {
    return "Telephone number must not exceed 50 characters.";
  }

  return null;
}

export async function createSupplier(
  formData: FormData,
) {
  const user = await requireSupplierManager();

  const supplierName = getText(
    formData,
    "supplier_name",
  );
  const contactPerson = getText(
    formData,
    "contact_person",
  );
  const mobileNumber = getText(
    formData,
    "mobile_number",
  );
  const telephoneNumber = getText(
    formData,
    "telephone_number",
  );
  const address = getText(formData, "address");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateSupplier({
    supplierName,
    contactPerson,
    mobileNumber,
    telephoneNumber,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        "/suppliers/new",
        "error",
        validationError,
      ),
    );
  }

  const [existingSuppliers] =
    await pool.execute<ExistingSupplierRow[]>(
      `
        SELECT id
        FROM suppliers
        WHERE LOWER(supplier_name) = LOWER(?)
        LIMIT 1
      `,
      [supplierName],
    );

  if (existingSuppliers.length > 0) {
    redirect(
      buildRedirectUrl(
        "/suppliers/new",
        "error",
        "A supplier with this name already exists.",
      ),
    );
  }

  const supplierCode = await generateSupplierCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO suppliers (
        supplier_code,
        supplier_name,
        contact_person,
        mobile_number,
        telephone_number,
        address,
        remarks,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      supplierCode,
      supplierName,
      contactPerson || null,
      mobileNumber || null,
      telephoneNumber || null,
      address || null,
      remarks || null,
      isActive,
      user.id,
      user.id,
    ],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `Created supplier ${supplierCode} - ` +
      supplierName,
    referenceId: String(result.insertId),
  });

  revalidatePath("/suppliers");

  redirect(
    buildRedirectUrl(
      "/suppliers",
      "success",
      "Supplier created successfully.",
    ),
  );
}

export async function updateSupplier(
  supplierId: number,
  formData: FormData,
) {
  const user = await requireSupplierManager();

  if (
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    redirect(
      buildRedirectUrl(
        "/suppliers",
        "error",
        "Invalid supplier.",
      ),
    );
  }

  const supplierName = getText(
    formData,
    "supplier_name",
  );
  const contactPerson = getText(
    formData,
    "contact_person",
  );
  const mobileNumber = getText(
    formData,
    "mobile_number",
  );
  const telephoneNumber = getText(
    formData,
    "telephone_number",
  );
  const address = getText(formData, "address");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateSupplier({
    supplierName,
    contactPerson,
    mobileNumber,
    telephoneNumber,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        `/suppliers/${supplierId}`,
        "error",
        validationError,
      ),
    );
  }

  const [existingSuppliers] =
    await pool.execute<ExistingSupplierRow[]>(
      `
        SELECT id
        FROM suppliers
        WHERE LOWER(supplier_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [supplierName, supplierId],
    );

  if (existingSuppliers.length > 0) {
    redirect(
      buildRedirectUrl(
        `/suppliers/${supplierId}`,
        "error",
        "Another supplier already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE suppliers
      SET
        supplier_name = ?,
        contact_person = ?,
        mobile_number = ?,
        telephone_number = ?,
        address = ?,
        remarks = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      supplierName,
      contactPerson || null,
      mobileNumber || null,
      telephoneNumber || null,
      address || null,
      remarks || null,
      isActive,
      user.id,
      supplierId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/suppliers",
        "error",
        "Supplier not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated supplier ${supplierName}`,
    referenceId: String(supplierId),
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);

  redirect(
    buildRedirectUrl(
      "/suppliers",
      "success",
      "Supplier updated successfully.",
    ),
  );
}

export async function toggleSupplierStatus(
  supplierId: number,
  newStatus: number,
) {
  const user = await requireSupplierManager();

  if (
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    redirect(
      buildRedirectUrl(
        "/suppliers",
        "error",
        "Invalid supplier.",
      ),
    );
  }

  const [supplierRows] =
    await pool.execute<SupplierInformationRow[]>(
      `
        SELECT
          supplier_code,
          supplier_name
        FROM suppliers
        WHERE id = ?
        LIMIT 1
      `,
      [supplierId],
    );

  const supplier = supplierRows[0];

  if (!supplier) {
    redirect(
      buildRedirectUrl(
        "/suppliers",
        "error",
        "Supplier not found.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  await pool.execute<ResultSetHeader>(
    `
      UPDATE suppliers
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, supplierId],
  );

  const action =
    normalizedStatus === 1
      ? "Activated"
      : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `${action} supplier ` +
      `${supplier.supplier_code} - ` +
      supplier.supplier_name,
    referenceId: String(supplierId),
  });

  revalidatePath("/suppliers");

  redirect(
    buildRedirectUrl(
      "/suppliers",
      "success",
      `Supplier ${action.toLowerCase()} successfully.`,
    ),
  );
}