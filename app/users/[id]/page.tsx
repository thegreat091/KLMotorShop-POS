import type { RowDataPacket } from "mysql2";
import { ArrowLeft, KeyRound, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { resetPasswordAction, updateUserAction } from "../actions";
import styles from "../users.module.css";

interface UserRow extends RowDataPacket {
  id: number;
  employee_id: string | null;
  full_name: string;
  username: string;
  role: "ADMIN" | "OWNER" | "CASHIER" | "INVENTORY";
  is_active: number;
}

type Params = {
  error?: string;
  success?: string;
};

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/");

  if (!["ADMIN", "OWNER"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isInteger(id) || id <= 0) notFound();

  const [rows] = await pool.execute<UserRow[]>(
    `
      SELECT id, employee_id, full_name, username, role, is_active
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  const user = rows[0];

  if (!user) notFound();

  if (user.role === "ADMIN") {
    redirect("/users?error=The%20system%20administrator%20account%20is%20protected.");
  }

  const query = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/users" className={styles.back}>
          <ArrowLeft size={17} />
          Users
        </Link>
      </div>

      {query.success ? (
        <div className={styles.success}>{query.success}</div>
      ) : null}

      {query.error ? (
        <div className={styles.error}>{query.error}</div>
      ) : null}

      <div className={styles.editGrid}>
        <section className={styles.formCard}>
          <header className={styles.formHeader}>
            <span className={styles.formIcon}>
              <Pencil size={22} />
            </span>
            <div>
              <div className={styles.eyebrow}>User Management</div>
              <h1>Edit User</h1>
              <p>{user.employee_id}</p>
            </div>
          </header>

          <form action={updateUserAction} className={styles.userForm}>
            <input type="hidden" name="id" value={user.id} />

            <label>
              Full Name *
              <input
                name="full_name"
                defaultValue={user.full_name}
                maxLength={150}
                required
              />
            </label>

            <label>
              Username *
              <input
                name="username"
                defaultValue={user.username}
                maxLength={100}
                required
              />
            </label>

            <label>
              Role *
              <select name="role" defaultValue={user.role}>
                <option value="OWNER">Owner</option>
                <option value="CASHIER">Cashier</option>
                <option value="INVENTORY">Inventory</option>
              </select>
            </label>

            <label>
              Status
              <input
                value={user.is_active ? "ACTIVE" : "INACTIVE"}
                disabled
              />
              <small>Status is changed from the Users list.</small>
            </label>

            <div className={styles.formActions}>
              <Link href="/users">Cancel</Link>
              <button type="submit">Save Changes</button>
            </div>
          </form>
        </section>

        <section className={styles.formCard}>
          <header className={styles.formHeader}>
            <span className={styles.formIcon}>
              <KeyRound size={22} />
            </span>
            <div>
              <div className={styles.eyebrow}>Security</div>
              <h2>Reset Password</h2>
              <p>Set a new password for {user.username}.</p>
            </div>
          </header>

          <form action={resetPasswordAction} className={styles.passwordForm}>
            <input type="hidden" name="id" value={user.id} />

            <label>
              New Password *
              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>

            <label>
              Confirm New Password *
              <input
                type="password"
                name="confirm_password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>

            <button type="submit">Reset Password</button>
          </form>
        </section>
      </div>
    </main>
  );
}
