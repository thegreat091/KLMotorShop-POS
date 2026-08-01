"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextClientCodeRow extends RowDataPacket {
  next_number: number;
}

interface ExistingClientRow extends RowDataPacket {
  id: number;
}

interface ClientInformationRow extends RowDataPacket {
  client_code: string;
  client_name: string;
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

async function requireClientManager() {
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

async function generateClientCode(): Promise<string> {
  const [rows] = await pool.query<NextClientCodeRow[]>(
    `
      SELECT
        COALESCE(
          MAX(
            CAST(
              SUBSTRING(client_code, 8)
              AS UNSIGNED
            )
          ),
          0
        ) + 1 AS next_number
      FROM clients
      WHERE client_code LIKE 'CLIENT-%'
    `,
  );

  const nextNumber = Number(rows[0]?.next_number ?? 1);

  return `CLIENT-${String(nextNumber).padStart(6, "0")}`;
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
      "Clients",
      "clients",
      parameters.referenceId ?? null,
    ],
  );
}

function validateClient(parameters: {
  clientName: string;
  mobileNumber: string;
}): string | null {
  if (!parameters.clientName) {
    return "Client name is required.";
  }

  if (parameters.clientName.length > 150) {
    return "Client name must not exceed 150 characters.";
  }

  if (parameters.mobileNumber.length > 50) {
    return "Mobile number must not exceed 50 characters.";
  }

  return null;
}

export async function createClient(formData: FormData) {
  const user = await requireClientManager();

  const clientName = getText(formData, "client_name");
  const mobileNumber = getText(formData, "mobile_number");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateClient({
    clientName,
    mobileNumber,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        "/clients/new",
        "error",
        validationError,
      ),
    );
  }

  if (mobileNumber) {
    const [existingClients] =
      await pool.execute<ExistingClientRow[]>(
        `
          SELECT id
          FROM clients
          WHERE mobile_number = ?
          LIMIT 1
        `,
        [mobileNumber],
      );

    if (existingClients.length > 0) {
      redirect(
        buildRedirectUrl(
          "/clients/new",
          "error",
          "Another client already uses this mobile number.",
        ),
      );
    }
  }

  const clientCode = await generateClientCode();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO clients (
        client_code,
        client_name,
        mobile_number,
        remarks,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      clientCode,
      clientName,
      mobileNumber || null,
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
    action: `Created client ${clientCode} - ${clientName}`,
    referenceId: String(result.insertId),
  });

  revalidatePath("/clients");

  redirect(
    buildRedirectUrl(
      "/clients",
      "success",
      "Client created successfully.",
    ),
  );
}

export async function updateClient(
  clientId: number,
  formData: FormData,
) {
  const user = await requireClientManager();

  if (!Number.isInteger(clientId) || clientId <= 0) {
    redirect(
      buildRedirectUrl(
        "/clients",
        "error",
        "Invalid client.",
      ),
    );
  }

  const clientName = getText(formData, "client_name");
  const mobileNumber = getText(formData, "mobile_number");
  const remarks = getText(formData, "remarks");
  const isActive =
    getText(formData, "is_active") === "0" ? 0 : 1;

  const validationError = validateClient({
    clientName,
    mobileNumber,
  });

  if (validationError) {
    redirect(
      buildRedirectUrl(
        `/clients/${clientId}`,
        "error",
        validationError,
      ),
    );
  }

  if (mobileNumber) {
    const [existingClients] =
      await pool.execute<ExistingClientRow[]>(
        `
          SELECT id
          FROM clients
          WHERE mobile_number = ?
            AND id <> ?
          LIMIT 1
        `,
        [mobileNumber, clientId],
      );

    if (existingClients.length > 0) {
      redirect(
        buildRedirectUrl(
          `/clients/${clientId}`,
          "error",
          "Another client already uses this mobile number.",
        ),
      );
    }
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE clients
      SET
        client_name = ?,
        mobile_number = ?,
        remarks = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [
      clientName,
      mobileNumber || null,
      remarks || null,
      isActive,
      user.id,
      clientId,
    ],
  );

  if (result.affectedRows === 0) {
    redirect(
      buildRedirectUrl(
        "/clients",
        "error",
        "Client not found.",
      ),
    );
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action: `Updated client ${clientName}`,
    referenceId: String(clientId),
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);

  redirect(
    buildRedirectUrl(
      "/clients",
      "success",
      "Client updated successfully.",
    ),
  );
}

export async function toggleClientStatus(
  clientId: number,
  newStatus: number,
) {
  const user = await requireClientManager();

  if (!Number.isInteger(clientId) || clientId <= 0) {
    redirect(
      buildRedirectUrl(
        "/clients",
        "error",
        "Invalid client.",
      ),
    );
  }

  const [clientRows] =
    await pool.execute<ClientInformationRow[]>(
      `
        SELECT
          client_code,
          client_name
        FROM clients
        WHERE id = ?
        LIMIT 1
      `,
      [clientId],
    );

  const client = clientRows[0];

  if (!client) {
    redirect(
      buildRedirectUrl(
        "/clients",
        "error",
        "Client not found.",
      ),
    );
  }

  const normalizedStatus = newStatus === 1 ? 1 : 0;

  await pool.execute<ResultSetHeader>(
    `
      UPDATE clients
      SET
        is_active = ?,
        updated_by = ?
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedStatus, user.id, clientId],
  );

  const action =
    normalizedStatus === 1 ? "Activated" : "Deactivated";

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action:
      `${action} client ${client.client_code} - ` +
      client.client_name,
    referenceId: String(clientId),
  });

  revalidatePath("/clients");

  redirect(
    buildRedirectUrl(
      "/clients",
      "success",
      `Client ${action.toLowerCase()} successfully.`,
    ),
  );
}