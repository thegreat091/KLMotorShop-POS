"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface BrandCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingBrandRow extends RowDataPacket {
  id: number;
}

interface BrandNameRow extends RowDataPacket {
  brand_name: string;
  brand_code: string;
}

function getText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function buildRedirectUrl(
  path: string,
  type: "success" | "error",
  message: string,
): string {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

async function requireBrandManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  return user;
}

async function generateBrandCode(): Promise<string> {
  const [rows] = await pool.query<BrandCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(brand_code, 5)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM product_brands
      WHERE brand_code LIKE 'BRD-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `BRD-${String(nextNumber).padStart(4, "0")}`;
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
      "Product Brands",
      "product_brands",
      parameters.referenceId ?? null,
    ],
  );
}

export async function createBrand(formData: FormData) {
  const user = await requireBrandManager();

  const brandName = getText(formData, "brand_name");
  const description = getText(formData, "description");
  const countryOfOrigin = getText(
    formData,
    "country_of_origin",
  );
  const website = getText(formData, "website");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!brandName) {
    redirect(
      buildRedirectUrl(
        "/brands/new",
        "error",
        "Brand name is required.",
      ),
    );
  }

  if (brandName.length > 120) {
    redirect(
      buildRedirectUrl(
        "/brands/new",
        "error",
        "Brand name must not exceed 120 characters.",
      ),
    );
  }

  if (countryOfOrigin.length > 100) {
    redirect(
      buildRedirectUrl(
        "/brands/new",
        "error",
        "Country of origin must not exceed 100 characters.",
      ),
    );
  }

  if (website.length > 255) {
    redirect(
      buildRedirectUrl(
        "/brands/new",
        "error",
        "Website must not exceed 255 characters.",
      ),
    );
  }

  const [existingBrands] =
    await pool.execute<ExistingBrandRow[]>(
      `
        SELECT id
        FROM product_brands
        WHERE LOWER(brand_name) = LOWER(?)
        LIMIT 1
      `,
      [brandName],
    );

  if (existingBrands.length > 0) {
    redirect(
      buildRedirectUrl(
        "/brands/new",
        "error",
        "A brand with this name already exists.",
      ),
    );
  }

  const brandCode = await generateBrandCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO product_brands (
        brand_code,
        brand_name,
        description,
        country_of_origin,
        website,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      brandCode,
      brandName,
      description || null,
      countryOfOrigin || null,
      website || null,
      isActive,
      user.id,
      user.id,
    ],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Created product brand ${brandCode} - ${brandName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/brands");

  redirect(
    buildRedirectUrl(
      "/brands",
      "success",
      "Brand created successfully.",
    ),
  );
}

export async function updateBrand(
  brandId: number,
  formData: FormData,
) {
  const user = await requireBrandManager();

  if (!Number.isInteger(brandId) || brandId <= 0) {
    redirect(
      buildRedirectUrl(
        "/brands",
        "error",
        "Invalid brand.",
      ),
    );
  }

  const brandName = getText(formData, "brand_name");
  const description = getText(formData, "description");
  const countryOfOrigin = getText(
    formData,
    "country_of_origin",
  );
  const website = getText(formData, "website");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!brandName) {
    redirect(
      buildRedirectUrl(
        `/brands/${brandId}`,
        "error",
        "Brand name is required.",
      ),
    );
  }

  if (brandName.length > 120) {
    redirect(
      buildRedirectUrl(
        `/brands/${brandId}`,
        "error",
        "Brand name must not exceed 120 characters.",
      ),
    );
  }

  if (countryOfOrigin.length > 100) {
    redirect(
      buildRedirectUrl(
        `/brands/${brandId}`,
        "error",
        "Country of origin must not exceed 100 characters.",
      ),
    );
  }

  if (website.length > 255) {
    redirect(
      buildRedirectUrl(
        `/brands/${brandId}`,
        "error",
        "Website must not exceed 255 characters.",
      ),
    );
  }

  const [existingBrands] =
    await pool.execute<ExistingBrandRow[]>(
      `
        SELECT id
        FROM product_brands
        WHERE LOWER(brand_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [brandName, brandId],
    );

  if (existingBrands.length > 0) {
    redirect(
      buildRedirectUrl(
        `/brands/${brandId}`,
        "error",
        "Another brand already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE product_brands
      SET
        brand_name = ?,
        description = ?,
        country_of_origin = ?,
        website = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      brandName,
      description || null,
      countryOfOrigin || null,
      website || null,
      isActive,
      user.id,
      brandId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/brands",
        "error",
        "Brand not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated product brand ${brandName}`,
    referenceId: String(brandId),
  });

  revalidatePath("/brands");
  revalidatePath(`/brands/${brandId}`);

  redirect(
    buildRedirectUrl(
      "/brands",
      "success",
      "Brand updated successfully.",
    ),
  );
}

export async function toggleBrandStatus(
  brandId: number,
  newStatus: number,
) {
  const user = await requireBrandManager();

  if (!Number.isInteger(brandId) || brandId <= 0) {
    redirect(
      buildRedirectUrl(
        "/brands",
        "error",
        "Invalid brand.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  const [brandRows] = await pool.execute<BrandNameRow[]>(
    `
      SELECT
        brand_name,
        brand_code
      FROM product_brands
      WHERE id = ?
      LIMIT 1
    `,
    [brandId],
  );

  const brand = brandRows[0];

  if (!brand) {
    redirect(
      buildRedirectUrl(
        "/brands",
        "error",
        "Brand not found.",
      ),
    );
  }

  await pool.execute<ResultSetHeader>(
    `
      UPDATE product_brands
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, brandId],
  );

  const statusText =
    normalizedStatus === 1 ? "activated" : "deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `${statusText === "activated" ? "Activated" : "Deactivated"} product brand ${brand.brand_code} - ${brand.brand_name}`,
    referenceId: String(brandId),
  });

  revalidatePath("/brands");

  redirect(
    buildRedirectUrl(
      "/brands",
      "success",
      `Brand ${statusText} successfully.`,
    ),
  );
}