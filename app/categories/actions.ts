"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface CategoryCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingCategoryRow extends RowDataPacket {
  id: number;
}

function getRequiredText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

async function requireCategoryManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  return user;
}

async function generateCategoryCode(): Promise<string> {
  const [rows] = await pool.query<CategoryCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(category_code, 5)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM product_categories
      WHERE category_code LIKE 'CAT-%'
    `,
  );

  const nextNumber = rows[0]?.next_number ?? 1;

  return `CAT-${String(nextNumber).padStart(4, "0")}`;
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
      "Product Categories",
      "product_categories",
      parameters.referenceId ?? null,
    ],
  );
}

export async function createCategory(formData: FormData) {
  const user = await requireCategoryManager();

  const categoryName = getRequiredText(
    formData,
    "category_name",
  );
  const description = getRequiredText(formData, "description");
  const isActive =
    getRequiredText(formData, "is_active") === "0" ? 0 : 1;

  if (!categoryName) {
    redirect(
      "/categories/new?error=Category name is required.",
    );
  }

  if (categoryName.length > 120) {
    redirect(
      "/categories/new?error=Category name must not exceed 120 characters.",
    );
  }

  const [existingCategories] =
    await pool.execute<ExistingCategoryRow[]>(
      `
        SELECT id
        FROM product_categories
        WHERE LOWER(category_name) = LOWER(?)
        LIMIT 1
      `,
      [categoryName],
    );

  if (existingCategories.length > 0) {
    redirect(
      `/categories/new?error=${encodeURIComponent(
        "A category with this name already exists.",
      )}`,
    );
  }

  const categoryCode = await generateCategoryCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO product_categories (
        category_code,
        category_name,
        description,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      categoryCode,
      categoryName,
      description || null,
      isActive,
      user.id,
      user.id,
    ],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Created product category ${categoryCode} - ${categoryName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/categories");

  redirect(
    `/categories?success=${encodeURIComponent(
      "Category created successfully.",
    )}`,
  );
}

export async function updateCategory(
  categoryId: number,
  formData: FormData,
) {
  const user = await requireCategoryManager();

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    redirect("/categories?error=Invalid category.");
  }

  const categoryName = getRequiredText(
    formData,
    "category_name",
  );
  const description = getRequiredText(formData, "description");
  const isActive =
    getRequiredText(formData, "is_active") === "0" ? 0 : 1;

  if (!categoryName) {
    redirect(
      `/categories/${categoryId}?error=${encodeURIComponent(
        "Category name is required.",
      )}`,
    );
  }

  if (categoryName.length > 120) {
    redirect(
      `/categories/${categoryId}?error=${encodeURIComponent(
        "Category name must not exceed 120 characters.",
      )}`,
    );
  }

  const [existingCategories] =
    await pool.execute<ExistingCategoryRow[]>(
      `
        SELECT id
        FROM product_categories
        WHERE LOWER(category_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [categoryName, categoryId],
    );

  if (existingCategories.length > 0) {
    redirect(
      `/categories/${categoryId}?error=${encodeURIComponent(
        "Another category already uses this name.",
      )}`,
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE product_categories
      SET
        category_name = ?,
        description = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      categoryName,
      description || null,
      isActive,
      user.id,
      categoryId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      `/categories?error=${encodeURIComponent(
        "Category not found.",
      )}`,
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated product category ${categoryName}`,
    referenceId: String(categoryId),
  });

  revalidatePath("/categories");
  revalidatePath(`/categories/${categoryId}`);

  redirect(
    `/categories?success=${encodeURIComponent(
      "Category updated successfully.",
    )}`,
  );
}

export async function toggleCategoryStatus(
  categoryId: number,
  newStatus: number,
) {
  const user = await requireCategoryManager();

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    redirect("/categories?error=Invalid category.");
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE product_categories
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, categoryId],
  );

  if (result.affectedRows === 0) {
    redirect(
      `/categories?error=${encodeURIComponent(
        "Category not found.",
      )}`,
    );
  }

  const statusText =
    normalizedStatus === 1 ? "activated" : "deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Product category ${statusText}`,
    referenceId: String(categoryId),
  });

  revalidatePath("/categories");

  redirect(
    `/categories?success=${encodeURIComponent(
      `Category ${statusText} successfully.`,
    )}`,
  );
}