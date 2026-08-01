"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingModelRow extends RowDataPacket {
  id: number;
}

interface ModelInformationRow extends RowDataPacket {
  model_code: string;
  model_name: string;
}

function getText(formData: FormData, fieldName: string): string {
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

async function requireMotorcycleModelManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  return user;
}

async function generateModelCode(): Promise<string> {
  const [rows] = await pool.query<NextCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(model_code, 7)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM motorcycle_models
      WHERE model_code LIKE 'MODEL-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `MODEL-${String(nextNumber).padStart(6, "0")}`;
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
      "Motorcycle Models",
      "motorcycle_models",
      parameters.referenceId ?? null,
    ],
  );
}

export async function createMotorcycleModel(
  formData: FormData,
) {
  const user = await requireMotorcycleModelManager();

  const modelName = getText(formData, "model_name");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!modelName) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models/new",
        "error",
        "Motorcycle model name is required.",
      ),
    );
  }

  if (modelName.length > 120) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models/new",
        "error",
        "Motorcycle model name must not exceed 120 characters.",
      ),
    );
  }

  const [existingModels] =
    await pool.execute<ExistingModelRow[]>(
      `
        SELECT id
        FROM motorcycle_models
        WHERE LOWER(model_name) = LOWER(?)
        LIMIT 1
      `,
      [modelName],
    );

  if (existingModels.length > 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models/new",
        "error",
        "A motorcycle model with this name already exists.",
      ),
    );
  }

  const modelCode = await generateModelCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO motorcycle_models (
        model_code,
        model_name,
        remarks,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      modelCode,
      modelName,
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
    action: `Created motorcycle model ${modelCode} - ${modelName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/motorcycle-models");

  redirect(
    buildRedirectUrl(
      "/motorcycle-models",
      "success",
      "Motorcycle model created successfully.",
    ),
  );
}

export async function updateMotorcycleModel(
  modelId: number,
  formData: FormData,
) {
  const user = await requireMotorcycleModelManager();

  if (!Number.isInteger(modelId) || modelId <= 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models",
        "error",
        "Invalid motorcycle model.",
      ),
    );
  }

  const modelName = getText(formData, "model_name");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!modelName) {
    redirect(
      buildRedirectUrl(
        `/motorcycle-models/${modelId}`,
        "error",
        "Motorcycle model name is required.",
      ),
    );
  }

  if (modelName.length > 120) {
    redirect(
      buildRedirectUrl(
        `/motorcycle-models/${modelId}`,
        "error",
        "Motorcycle model name must not exceed 120 characters.",
      ),
    );
  }

  const [existingModels] =
    await pool.execute<ExistingModelRow[]>(
      `
        SELECT id
        FROM motorcycle_models
        WHERE LOWER(model_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [modelName, modelId],
    );

  if (existingModels.length > 0) {
    redirect(
      buildRedirectUrl(
        `/motorcycle-models/${modelId}`,
        "error",
        "Another motorcycle model already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE motorcycle_models
      SET
        model_name = ?,
        remarks = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      modelName,
      remarks || null,
      isActive,
      user.id,
      modelId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models",
        "error",
        "Motorcycle model not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated motorcycle model ${modelName}`,
    referenceId: String(modelId),
  });

  revalidatePath("/motorcycle-models");
  revalidatePath(`/motorcycle-models/${modelId}`);

  redirect(
    buildRedirectUrl(
      "/motorcycle-models",
      "success",
      "Motorcycle model updated successfully.",
    ),
  );
}

export async function toggleMotorcycleModelStatus(
  modelId: number,
  newStatus: number,
) {
  const user = await requireMotorcycleModelManager();

  if (!Number.isInteger(modelId) || modelId <= 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models",
        "error",
        "Invalid motorcycle model.",
      ),
    );
  }

  const [modelRows] =
    await pool.execute<ModelInformationRow[]>(
      `
        SELECT
          model_code,
          model_name
        FROM motorcycle_models
        WHERE id = ?
        LIMIT 1
      `,
      [modelId],
    );

  const model = modelRows[0];

  if (!model) {
    redirect(
      buildRedirectUrl(
        "/motorcycle-models",
        "error",
        "Motorcycle model not found.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  await pool.execute<ResultSetHeader>(
    `
      UPDATE motorcycle_models
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, modelId],
  );

  const action =
    normalizedStatus === 1 ? "Activated" : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `${action} motorcycle model ` +
      `${model.model_code} - ${model.model_name}`,
    referenceId: String(modelId),
  });

  revalidatePath("/motorcycle-models");

  redirect(
    buildRedirectUrl(
      "/motorcycle-models",
      "success",
      `Motorcycle model ${action.toLowerCase()} successfully.`,
    ),
  );
}