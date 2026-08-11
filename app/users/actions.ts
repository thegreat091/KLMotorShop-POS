"use server";

import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

type ManagedRole = "OWNER" | "CASHIER" | "INVENTORY";

interface UserRow extends RowDataPacket {
  id: number;
  employee_id: string | null;
  full_name: string;
  username: string;
  role: "ADMIN" | ManagedRole;
  is_active: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function requireUserManager() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/");
  }

  if (!["ADMIN", "OWNER"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  return currentUser;
}

async function writeActivity(
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>,
  action: string,
  referenceId: string,
) {
  if (!currentUser) return;

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
      VALUES (?, ?, ?, ?, 'User Management', 'users', ?)
    `,
    [
      currentUser.id,
      currentUser.fullName,
      currentUser.role,
      action,
      referenceId,
    ],
  );
}

async function nextEmployeeId() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT employee_id
      FROM users
      WHERE employee_id IS NOT NULL
      ORDER BY id DESC
    `,
  );

  let highest = 0;

  for (const row of rows) {
    const match = String(row.employee_id ?? "").match(/(\d+)$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  return `EMP-${String(highest + 1).padStart(4, "0")}`;
}

export async function createUserAction(formData: FormData) {
  const currentUser = await requireUserManager();

  const fullName = clean(formData.get("full_name"));
  const username = normalizeUsername(clean(formData.get("username")));
  const password = clean(formData.get("password"));
  const confirmPassword = clean(formData.get("confirm_password"));
  const role = clean(formData.get("role")) as ManagedRole;

  if (!fullName || !username || !password) {
    redirect("/users/new?error=Please%20complete%20all%20required%20fields.");
  }

  if (!["OWNER", "CASHIER", "INVENTORY"].includes(role)) {
    redirect("/users/new?error=Invalid%20user%20role.");
  }

  if (username.length < 3) {
    redirect("/users/new?error=Username%20must%20be%20at%20least%203%20characters.");
  }

  if (password.length < 8) {
    redirect("/users/new?error=Password%20must%20be%20at%20least%208%20characters.");
  }

  if (password !== confirmPassword) {
    redirect("/users/new?error=Passwords%20do%20not%20match.");
  }

  const [existing] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE CONVERT(username USING utf8mb4) COLLATE utf8mb4_unicode_ci
          = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      LIMIT 1
    `,
    [username],
  );

  if (existing.length > 0) {
    redirect("/users/new?error=That%20username%20is%20already%20in%20use.");
  }

  const employeeId = await nextEmployeeId();
  const passwordHash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute<ResultSetHeader>(
    `
      INSERT INTO users (
        employee_id,
        full_name,
        username,
        password_hash,
        role,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [employeeId, fullName, username, passwordHash, role],
  );

  await writeActivity(
    currentUser,
    `Created ${role} user "${username}" (${fullName}).`,
    String(result.insertId),
  );

  revalidatePath("/users");
  redirect("/users?success=User%20account%20created.");
}

export async function updateUserAction(formData: FormData) {
  const currentUser = await requireUserManager();

  const id = Number(clean(formData.get("id")));
  const fullName = clean(formData.get("full_name"));
  const username = normalizeUsername(clean(formData.get("username")));
  const role = clean(formData.get("role")) as ManagedRole;

  if (!Number.isInteger(id) || id <= 0) {
    redirect("/users?error=Invalid%20user.");
  }

  const [rows] = await pool.execute<UserRow[]>(
    `
      SELECT id, employee_id, full_name, username, role, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  const target = rows[0];

  if (!target) {
    redirect("/users?error=User%20not%20found.");
  }

  if (target.role === "ADMIN") {
    redirect("/users?error=The%20system%20administrator%20account%20is%20protected.");
  }

  if (!fullName || !username) {
    redirect(`/users/${id}?error=Full%20name%20and%20username%20are%20required.`);
  }

  if (!["OWNER", "CASHIER", "INVENTORY"].includes(role)) {
    redirect(`/users/${id}?error=Invalid%20user%20role.`);
  }

  const [duplicate] = await pool.execute<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE CONVERT(username USING utf8mb4) COLLATE utf8mb4_unicode_ci
          = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND id <> ?
      LIMIT 1
    `,
    [username, id],
  );

  if (duplicate.length > 0) {
    redirect(`/users/${id}?error=That%20username%20is%20already%20in%20use.`);
  }

  await pool.execute(
    `
      UPDATE users
      SET
        full_name = ?,
        username = ?,
        role = ?
      WHERE id = ?
    `,
    [fullName, username, role, id],
  );

  await writeActivity(
    currentUser,
    `Updated user "${target.username}" to username "${username}", role ${role}, full name "${fullName}".`,
    String(id),
  );

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  redirect("/users?success=User%20account%20updated.");
}

export async function resetPasswordAction(formData: FormData) {
  const currentUser = await requireUserManager();

  const id = Number(clean(formData.get("id")));
  const password = clean(formData.get("password"));
  const confirmPassword = clean(formData.get("confirm_password"));

  if (!Number.isInteger(id) || id <= 0) {
    redirect("/users?error=Invalid%20user.");
  }

  const [rows] = await pool.execute<UserRow[]>(
    `
      SELECT id, employee_id, full_name, username, role, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  const target = rows[0];

  if (!target) {
    redirect("/users?error=User%20not%20found.");
  }

  if (target.role === "ADMIN") {
    redirect("/users?error=The%20system%20administrator%20account%20is%20protected.");
  }

  if (password.length < 8) {
    redirect(`/users/${id}?error=Password%20must%20be%20at%20least%208%20characters.`);
  }

  if (password !== confirmPassword) {
    redirect(`/users/${id}?error=Passwords%20do%20not%20match.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.execute(
    `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `,
    [passwordHash, id],
  );

  await writeActivity(
    currentUser,
    `Reset password for user "${target.username}".`,
    String(id),
  );

  revalidatePath(`/users/${id}`);
  redirect(`/users/${id}?success=Password%20reset%20successfully.`);
}

export async function toggleUserStatusAction(formData: FormData) {
  const currentUser = await requireUserManager();

  const id = Number(clean(formData.get("id")));

  if (!Number.isInteger(id) || id <= 0) {
    redirect("/users?error=Invalid%20user.");
  }

  const [rows] = await pool.execute<UserRow[]>(
    `
      SELECT id, employee_id, full_name, username, role, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  const target = rows[0];

  if (!target) {
    redirect("/users?error=User%20not%20found.");
  }

  if (target.role === "ADMIN") {
    redirect("/users?error=The%20system%20administrator%20account%20is%20protected.");
  }

  if (target.id === currentUser.id) {
    redirect("/users?error=You%20cannot%20deactivate%20your%20own%20account.");
  }

  const nextActive = target.is_active ? 0 : 1;

  await pool.execute(
    `
      UPDATE users
      SET is_active = ?
      WHERE id = ?
    `,
    [nextActive, id],
  );

  await writeActivity(
    currentUser,
    `${nextActive ? "Activated" : "Deactivated"} user "${target.username}".`,
    String(id),
  );

  revalidatePath("/users");
  redirect(`/users?success=User%20${nextActive ? "activated" : "deactivated"}.`);
}
