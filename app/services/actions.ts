"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface ServiceCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingServiceRow extends RowDataPacket {
  id: number;
}

interface ServiceNameRow extends RowDataPacket {
  service_code: string;
  service_name: string;
}

function getText(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, fieldName: string): number {
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

async function requireServiceManager() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  return user;
}

async function generateServiceCode(): Promise<string> {
  const [rows] = await pool.query<ServiceCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(service_code, 5)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM services
      WHERE service_code LIKE 'SRV-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `SRV-${String(nextNumber).padStart(4, "0")}`;
}

function validateService(parameters: {
  serviceName: string;
  serviceCharge: number;
  ownerPercentage: number;
  mechanicPercentage: number;
  estimatedMinutes: number;
}): string | null {
  if (!parameters.serviceName) {
    return "Service name is required.";
  }

  if (parameters.serviceName.length > 150) {
    return "Service name must not exceed 150 characters.";
  }

  if (parameters.serviceCharge < 0) {
    return "Service charge cannot be negative.";
  }

  if (
    parameters.ownerPercentage < 0 ||
    parameters.ownerPercentage > 100 ||
    parameters.mechanicPercentage < 0 ||
    parameters.mechanicPercentage > 100
  ) {
    return "Owner and mechanic percentages must be between 0 and 100.";
  }

  const percentageTotal = Number(
    (
      parameters.ownerPercentage +
      parameters.mechanicPercentage
    ).toFixed(2),
  );

  if (percentageTotal !== 100) {
    return "Owner and mechanic percentages must total exactly 100%.";
  }

  if (
    parameters.estimatedMinutes < 0 ||
    !Number.isInteger(parameters.estimatedMinutes)
  ) {
    return "Estimated time must be a whole number of minutes.";
  }

  return null;
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
      "Services",
      "services",
      parameters.referenceId ?? null,
    ],
  );
}

export async function createService(formData: FormData) {
  const user = await requireServiceManager();

  const serviceName = getText(formData, "service_name");
  const description = getText(formData, "description");
  const serviceCharge = getNumber(formData, "service_charge");
  const ownerPercentage = getNumber(
    formData,
    "owner_percentage",
  );
  const mechanicPercentage = getNumber(
    formData,
    "mechanic_percentage",
  );
  const estimatedMinutes = getNumber(
    formData,
    "estimated_minutes",
  );
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateService({
    serviceName,
    serviceCharge,
    ownerPercentage,
    mechanicPercentage,
    estimatedMinutes,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        "/services/new",
        "error",
        validationError,
      ),
    );
  }

  const [existingServices] =
    await pool.execute<ExistingServiceRow[]>(
      `
        SELECT id
        FROM services
        WHERE LOWER(service_name) = LOWER(?)
        LIMIT 1
      `,
      [serviceName],
    );

  if (existingServices.length > 0) {
    redirect(
      buildRedirectUrl(
        "/services/new",
        "error",
        "A service with this name already exists.",
      ),
    );
  }

  const serviceCode = await generateServiceCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO services (
        service_code,
        service_name,
        description,
        service_charge,
        owner_percentage,
        mechanic_percentage,
        estimated_minutes,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      serviceCode,
      serviceName,
      description || null,
      serviceCharge,
      ownerPercentage,
      mechanicPercentage,
      estimatedMinutes || null,
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
      `Created service ${serviceCode} - ${serviceName} ` +
      `with charge ₱${serviceCharge.toFixed(2)} ` +
      `(${ownerPercentage.toFixed(2)}% owner / ` +
      `${mechanicPercentage.toFixed(2)}% mechanic)`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/services");

  redirect(
    buildRedirectUrl(
      "/services",
      "success",
      "Service created successfully.",
    ),
  );
}

export async function updateService(
  serviceId: number,
  formData: FormData,
) {
  const user = await requireServiceManager();

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    redirect(
      buildRedirectUrl(
        "/services",
        "error",
        "Invalid service.",
      ),
    );
  }

  const serviceName = getText(formData, "service_name");
  const description = getText(formData, "description");
  const serviceCharge = getNumber(formData, "service_charge");
  const ownerPercentage = getNumber(
    formData,
    "owner_percentage",
  );
  const mechanicPercentage = getNumber(
    formData,
    "mechanic_percentage",
  );
  const estimatedMinutes = getNumber(
    formData,
    "estimated_minutes",
  );
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateService({
    serviceName,
    serviceCharge,
    ownerPercentage,
    mechanicPercentage,
    estimatedMinutes,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        `/services/${serviceId}`,
        "error",
        validationError,
      ),
    );
  }

  const [existingServices] =
    await pool.execute<ExistingServiceRow[]>(
      `
        SELECT id
        FROM services
        WHERE LOWER(service_name) = LOWER(?)
          AND id <> ?
        LIMIT 1
      `,
      [serviceName, serviceId],
    );

  if (existingServices.length > 0) {
    redirect(
      buildRedirectUrl(
        `/services/${serviceId}`,
        "error",
        "Another service already uses this name.",
      ),
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE services
      SET
        service_name = ?,
        description = ?,
        service_charge = ?,
        owner_percentage = ?,
        mechanic_percentage = ?,
        estimated_minutes = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      serviceName,
      description || null,
      serviceCharge,
      ownerPercentage,
      mechanicPercentage,
      estimatedMinutes || null,
      isActive,
      user.id,
      serviceId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/services",
        "error",
        "Service not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `Updated service ${serviceName} with charge ` +
      `₱${serviceCharge.toFixed(2)} ` +
      `(${ownerPercentage.toFixed(2)}% owner / ` +
      `${mechanicPercentage.toFixed(2)}% mechanic)`,
    referenceId: String(serviceId),
  });

  revalidatePath("/services");
  revalidatePath(`/services/${serviceId}`);

  redirect(
    buildRedirectUrl(
      "/services",
      "success",
      "Service updated successfully.",
    ),
  );
}

export async function toggleServiceStatus(
  serviceId: number,
  newStatus: number,
) {
  const user = await requireServiceManager();

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    redirect(
      buildRedirectUrl(
        "/services",
        "error",
        "Invalid service.",
      ),
    );
  }

  const [serviceRows] =
    await pool.execute<ServiceNameRow[]>(
      `
        SELECT
          service_code,
          service_name
        FROM services
        WHERE id = ?
        LIMIT 1
      `,
      [serviceId],
    );

  const service = serviceRows[0];

  if (!service) {
    redirect(
      buildRedirectUrl(
        "/services",
        "error",
        "Service not found.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  await pool.execute(
    `
      UPDATE services
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, serviceId],
  );

  const action =
    normalizedStatus === 1 ? "Activated" : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `${action} service ${service.service_code} - ` +
      service.service_name,
    referenceId: String(serviceId),
  });

  revalidatePath("/services");

  redirect(
    buildRedirectUrl(
      "/services",
      "success",
      `Service ${action.toLowerCase()} successfully.`,
    ),
  );
}