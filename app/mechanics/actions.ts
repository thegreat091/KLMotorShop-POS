"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface MechanicCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingMechanicRow extends RowDataPacket {
  id: number;
}

interface MechanicNameRow extends RowDataPacket {
  mechanic_code: string;
  full_name: string;
}

function getText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

function getPercentage(
  formData: FormData,
  fieldName: string,
): number {
  const value = Number(getText(formData, fieldName));

  return Number.isFinite(value) ? value : 0;
}

function buildRedirectUrl(
  path: string,
  type: "success" | "error",
  message: string,
): string {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}

async function requireMechanicManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  return user;
}

async function generateMechanicCode(): Promise<string> {
  const [rows] = await pool.query<MechanicCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(mechanic_code, 5)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM mechanics
      WHERE mechanic_code LIKE 'MEC-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `MEC-${String(nextNumber).padStart(4, "0")}`;
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
      "Mechanics",
      "mechanics",
      parameters.referenceId ?? null,
    ],
  );
}

function validatePercentages(
  ownerPercentage: number,
  mechanicPercentage: number,
): string | null {
  if (
    ownerPercentage < 0 ||
    ownerPercentage > 100 ||
    mechanicPercentage < 0 ||
    mechanicPercentage > 100
  ) {
    return "Commission percentages must be between 0 and 100.";
  }

  const total = Number(
    (ownerPercentage + mechanicPercentage).toFixed(2),
  );

  if (total !== 100) {
    return "Owner and mechanic percentages must total exactly 100%.";
  }

  return null;
}

export async function createMechanic(formData: FormData) {
  const user = await requireMechanicManager();

  const fullName = getText(formData, "full_name");
  const contactNumber = getText(formData, "contact_number");
  const email = getText(formData, "email");
  const address = getText(formData, "address");
  const dateHired = getText(formData, "date_hired");
  const ownerPercentage = getPercentage(
    formData,
    "default_owner_percentage",
  );
  const mechanicPercentage = getPercentage(
    formData,
    "default_mechanic_percentage",
  );
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!fullName) {
    redirect(
      buildRedirectUrl(
        "/mechanics/new",
        "error",
        "Mechanic name is required.",
      ),
    );
  }

  if (fullName.length > 150) {
    redirect(
      buildRedirectUrl(
        "/mechanics/new",
        "error",
        "Mechanic name must not exceed 150 characters.",
      ),
    );
  }

  const percentageError = validatePercentages(
    ownerPercentage,
    mechanicPercentage,
  );

  if (percentageError) {
    redirect(
      buildRedirectUrl(
        "/mechanics/new",
        "error",
        percentageError,
      ),
    );
  }

  const [existingMechanics] =
    await pool.execute<ExistingMechanicRow[]>(
      `
        SELECT id
        FROM mechanics
        WHERE LOWER(full_name) = LOWER(?)
        LIMIT 1
      `,
      [fullName],
    );

  if (existingMechanics.length > 0) {
    redirect(
      buildRedirectUrl(
        "/mechanics/new",
        "error",
        "A mechanic with this name already exists.",
      ),
    );
  }

  const mechanicCode = await generateMechanicCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO mechanics (
        mechanic_code,
        full_name,
        contact_number,
        email,
        address,
        date_hired,
        default_owner_percentage,
        default_mechanic_percentage,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      mechanicCode,
      fullName,
      contactNumber || null,
      email || null,
      address || null,
      dateHired || null,
      ownerPercentage,
      mechanicPercentage,
      isActive,
      user.id,
      user.id,
    ],
  );

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Created mechanic ${mechanicCode} - ${fullName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/mechanics");

  redirect(
    buildRedirectUrl(
      "/mechanics",
      "success",
      "Mechanic created successfully.",
    ),
  );
}

export async function updateMechanic(
  mechanicId: number,
  formData: FormData,
) {
  const user = await requireMechanicManager();

  if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
    redirect(
      buildRedirectUrl(
        "/mechanics",
        "error",
        "Invalid mechanic.",
      ),
    );
  }

  const fullName = getText(formData, "full_name");
  const contactNumber = getText(formData, "contact_number");
  const email = getText(formData, "email");
  const address = getText(formData, "address");
  const dateHired = getText(formData, "date_hired");
  const ownerPercentage = getPercentage(
    formData,
    "default_owner_percentage",
  );
  const mechanicPercentage = getPercentage(
    formData,
    "default_mechanic_percentage",
  );
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  if (!fullName) {
    redirect(
      buildRedirectUrl(
        `/mechanics/${mechanicId}`,
        "error",
        "Mechanic name is required.",
      ),
    );
  }

  const percentageError = validatePercentages(
    ownerPercentage,
    mechanicPercentage,
  );

  if (percentageError) {
    redirect(
      buildRedirectUrl(
        `/mechanics/${mechanicId}`,
        "error",
        percentageError,
      ),
    );
  }

  const [existingMechanics] =
    await pool.execute<ExistingMechanicRow[]>(
      `
        SELECT id
        FROM mechanics
        WHERE LOWER(full_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [fullName, mechanicId],
    );

  if (existingMechanics.length > 0) {
    redirect(
      buildRedirectUrl(
        `/mechanics/${mechanicId}`,
        "error",
        "Another mechanic already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE mechanics
      SET
        full_name = ?,
        contact_number = ?,
        email = ?,
        address = ?,
        date_hired = ?,
        default_owner_percentage = ?,
        default_mechanic_percentage = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      fullName,
      contactNumber || null,
      email || null,
      address || null,
      dateHired || null,
      ownerPercentage,
      mechanicPercentage,
      isActive,
      user.id,
      mechanicId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/mechanics",
        "error",
        "Mechanic not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated mechanic ${fullName}`,
    referenceId: String(mechanicId),
  });

  revalidatePath("/mechanics");
  revalidatePath(`/mechanics/${mechanicId}`);

  redirect(
    buildRedirectUrl(
      "/mechanics",
      "success",
      "Mechanic updated successfully.",
    ),
  );
}

export async function toggleMechanicStatus(
  mechanicId: number,
  newStatus: number,
) {
  const user = await requireMechanicManager();

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  const [mechanicRows] =
    await pool.execute<MechanicNameRow[]>(
      `
        SELECT mechanic_code, full_name
        FROM mechanics
        WHERE id = ?
        LIMIT 1
      `,
      [mechanicId],
    );

  const mechanic = mechanicRows[0];

  if (!mechanic) {
    redirect(
      buildRedirectUrl(
        "/mechanics",
        "error",
        "Mechanic not found.",
      ),
    );
  }

  await pool.execute(
    `
      UPDATE mechanics
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, mechanicId],
  );

  const action =
    normalizedStatus === 1 ? "Activated" : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `${action} mechanic ${mechanic.mechanic_code} - ${mechanic.full_name}`,
    referenceId: String(mechanicId),
  });

  revalidatePath("/mechanics");

  redirect(
    buildRedirectUrl(
      "/mechanics",
      "success",
      `Mechanic ${action.toLowerCase()} successfully.`,
    ),
  );
}