"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextMotorcycleCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingMotorcycleRow extends RowDataPacket {
  id: number;
}

interface ActiveRecordRow extends RowDataPacket {
  id: number;
}

interface MotorcycleInformationRow extends RowDataPacket {
  motorcycle_code: string;
  plate_number: string;
}

function getText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

function getPositiveInteger(
  formData: FormData,
  fieldName: string,
): number {
  const value = Number(getText(formData, fieldName));

  if (!Number.isInteger(value) || value <= 0) {
    return 0;
  }

  return value;
}

function normalizePlateNumber(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function buildRedirectUrl(
  path: string,
  type: "success" | "error",
  message: string,
): string {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

async function requireMotorcycleManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (
    user.role !== "ADMIN" &&
    user.role !== "OWNER" &&
    user.role !== "CASHIER"
  ) {
    redirect("/dashboard");
  }

  return user;
}

async function generateMotorcycleCode(): Promise<string> {
  const [rows] = await pool.query<NextMotorcycleCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(motorcycle_code, 6)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM motorcycles
      WHERE motorcycle_code LIKE 'BIKE-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `BIKE-${String(nextNumber).padStart(6, "0")}`;
}

async function verifyActiveClient(
  clientId: number,
): Promise<boolean> {
  const [rows] = await pool.execute<ActiveRecordRow[]>(
    `
      SELECT id
      FROM clients
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
    `,
    [clientId],
  );

  return rows.length > 0;
}

async function verifyActiveModel(
  modelId: number,
): Promise<boolean> {
  const [rows] = await pool.execute<ActiveRecordRow[]>(
    `
      SELECT id
      FROM motorcycle_models
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
    `,
    [modelId],
  );

  return rows.length > 0;
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
      "Motorcycles",
      "motorcycles",
      parameters.referenceId ?? null,
    ],
  );
}

export async function createMotorcycle(
  formData: FormData,
) {
  const user = await requireMotorcycleManager();

  const clientId = getPositiveInteger(formData, "client_id");
  const modelId = getPositiveInteger(formData, "model_id");
  const plateNumber = normalizePlateNumber(
    getText(formData, "plate_number"),
  );
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!clientId) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "Please select a client.",
      ),
    );
  }

  if (!modelId) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "Please select a motorcycle model.",
      ),
    );
  }

  if (!plateNumber) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "Plate number is required.",
      ),
    );
  }

  if (plateNumber.length > 50) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "Plate number must not exceed 50 characters.",
      ),
    );
  }

  if (!(await verifyActiveClient(clientId))) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "The selected client is unavailable or inactive.",
      ),
    );
  }

  if (!(await verifyActiveModel(modelId))) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "The selected motorcycle model is unavailable or inactive.",
      ),
    );
  }

  const [existingMotorcycles] =
    await pool.execute<ExistingMotorcycleRow[]>(
      `
        SELECT id
        FROM motorcycles
        WHERE UPPER(plate_number) = UPPER(?)
        LIMIT 1
      `,
      [plateNumber],
    );

  if (existingMotorcycles.length > 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycles/new",
        "error",
        "A motorcycle with this plate number already exists.",
      ),
    );
  }

  const motorcycleCode = await generateMotorcycleCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO motorcycles (
        motorcycle_code,
        client_id,
        model_id,
        plate_number,
        remarks,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      motorcycleCode,
      clientId,
      modelId,
      plateNumber,
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
      `Created motorcycle ${motorcycleCode} - ` +
      `${plateNumber}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/motorcycles");
  revalidatePath("/clients");
  revalidatePath("/motorcycle-models");

  redirect(
    buildRedirectUrl(
      "/motorcycles",
      "success",
      "Motorcycle created successfully.",
    ),
  );
}

export async function updateMotorcycle(
  motorcycleId: number,
  formData: FormData,
) {
  const user = await requireMotorcycleManager();

  if (
    !Number.isInteger(motorcycleId) ||
    motorcycleId <= 0
  ) {
    redirect(
      buildRedirectUrl(
        "/motorcycles",
        "error",
        "Invalid motorcycle.",
      ),
    );
  }

  const clientId = getPositiveInteger(formData, "client_id");
  const modelId = getPositiveInteger(formData, "model_id");
  const plateNumber = normalizePlateNumber(
    getText(formData, "plate_number"),
  );
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!clientId) {
    redirect(
      buildRedirectUrl(
        `/motorcycles/${motorcycleId}`,
        "error",
        "Please select a client.",
      ),
    );
  }

  if (!modelId) {
    redirect(
      buildRedirectUrl(
        `/motorcycles/${motorcycleId}`,
        "error",
        "Please select a motorcycle model.",
      ),
    );
  }

  if (!plateNumber) {
    redirect(
      buildRedirectUrl(
        `/motorcycles/${motorcycleId}`,
        "error",
        "Plate number is required.",
      ),
    );
  }

  if (plateNumber.length > 50) {
    redirect(
      buildRedirectUrl(
        `/motorcycles/${motorcycleId}`,
        "error",
        "Plate number must not exceed 50 characters.",
      ),
    );
  }

  const [existingMotorcycles] =
    await pool.execute<ExistingMotorcycleRow[]>(
      `
        SELECT id
        FROM motorcycles
        WHERE UPPER(plate_number) = UPPER(?)
          AND id <> ?
        LIMIT 1
      `,
      [plateNumber, motorcycleId],
    );

  if (existingMotorcycles.length > 0) {
    redirect(
      buildRedirectUrl(
        `/motorcycles/${motorcycleId}`,
        "error",
        "Another motorcycle already uses this plate number.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE motorcycles
      SET
        client_id = ?,
        model_id = ?,
        plate_number = ?,
        remarks = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      clientId,
      modelId,
      plateNumber,
      remarks || null,
      isActive,
      user.id,
      motorcycleId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/motorcycles",
        "error",
        "Motorcycle not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated motorcycle ${plateNumber}`,
    referenceId: String(motorcycleId),
  });

  revalidatePath("/motorcycles");
  revalidatePath(`/motorcycles/${motorcycleId}`);
  revalidatePath("/clients");
  revalidatePath("/motorcycle-models");

  redirect(
    buildRedirectUrl(
      "/motorcycles",
      "success",
      "Motorcycle updated successfully.",
    ),
  );
}

export async function toggleMotorcycleStatus(
  motorcycleId: number,
  newStatus: number,
) {
  const user = await requireMotorcycleManager();

  if (
    !Number.isInteger(motorcycleId) ||
    motorcycleId <= 0
  ) {
    redirect(
      buildRedirectUrl(
        "/motorcycles",
        "error",
        "Invalid motorcycle.",
      ),
    );
  }

  const [motorcycleRows] =
    await pool.execute<MotorcycleInformationRow[]>(
      `
        SELECT
          motorcycle_code,
          plate_number
        FROM motorcycles
        WHERE id = ?
        LIMIT 1
      `,
      [motorcycleId],
    );

  const motorcycle = motorcycleRows[0];

  if (!motorcycle) {
    redirect(
      buildRedirectUrl(
        "/motorcycles",
        "error",
        "Motorcycle not found.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  await pool.execute<ResultSetHeader>(
    `
      UPDATE motorcycles
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, motorcycleId],
  );

  const action =
    normalizedStatus === 1 ? "Activated" : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `${action} motorcycle ` +
      `${motorcycle.motorcycle_code} - ` +
      motorcycle.plate_number,
    referenceId: String(motorcycleId),
  });

  revalidatePath("/motorcycles");
  revalidatePath("/clients");
  revalidatePath("/motorcycle-models");

  redirect(
    buildRedirectUrl(
      "/motorcycles",
      "success",
      `Motorcycle ${action.toLowerCase()} successfully.`,
    ),
  );
}