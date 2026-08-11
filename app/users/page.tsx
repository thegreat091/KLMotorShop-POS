import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  CheckCircle2,
  CircleOff,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleUserStatusAction } from "./actions";
import styles from "./users.module.css";

interface UserRow extends RowDataPacket {
  id: number;
  employee_id: string | null;
  full_name: string;
  username: string;
  role: "ADMIN" | "OWNER" | "CASHIER" | "INVENTORY";
  is_active: number;
  last_login_at: Date | string | null;
  created_at: Date | string;
}

type Params = {
  q?: string;
  role?: string;
  status?: string;
  success?: string;
  error?: string;
};

function formatDate(value: Date | string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/");

  if (!["ADMIN", "OWNER"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const role = (params.role ?? "").trim();
  const status = (params.status ?? "").trim();
  const like = `%${q}%`;

  const [rows] = await pool.execute<UserRow[]>(
    `
      SELECT
        id,
        employee_id,
        full_name,
        username,
        role,
        is_active,
        last_login_at,
        created_at
      FROM users
      WHERE
        (
          CAST(? AS CHAR CHARACTER SET utf8mb4) = ''
          OR CONVERT(full_name USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
          OR CONVERT(username USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
          OR CONVERT(COALESCE(employee_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        )
        AND (
          CAST(? AS CHAR CHARACTER SET utf8mb4) = ''
          OR CONVERT(role USING utf8mb4) COLLATE utf8mb4_unicode_ci
             = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        )
        AND (
          ? = ''
          OR (? = 'ACTIVE' AND is_active = 1)
          OR (? = 'INACTIVE' AND is_active = 0)
        )
      ORDER BY
        CASE role
          WHEN 'ADMIN' THEN 1
          WHEN 'OWNER' THEN 2
          WHEN 'CASHIER' THEN 3
          WHEN 'INVENTORY' THEN 4
          ELSE 5
        END,
        full_name
    `,
    [q, like, like, like, role, role, status, status, status],
  );

  const active = rows.filter((row) => Boolean(row.is_active)).length;
  const owners = rows.filter((row) => row.role === "OWNER").length;
  const cashiers = rows.filter((row) => row.role === "CASHIER").length;
  const inventory = rows.filter((row) => row.role === "INVENTORY").length;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <Link href="/users/new" className={styles.primaryButton}>
          <Plus size={17} />
          Add User
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>User Management</h1>
          <p>
            Manage Owner, Cashier, and Inventory accounts. The system
            administrator account is protected.
          </p>
        </div>
        <UserCog size={44} />
      </section>

      {params.success ? (
        <div className={styles.success}>{params.success}</div>
      ) : null}

      {params.error ? (
        <div className={styles.error}>{params.error}</div>
      ) : null}

      <section className={styles.metrics}>
        <article>
          <UsersRound />
          <span>Total Accounts</span>
          <strong>{rows.length}</strong>
        </article>
        <article>
          <CheckCircle2 />
          <span>Active</span>
          <strong>{active}</strong>
        </article>
        <article>
          <ShieldCheck />
          <span>Owners</span>
          <strong>{owners}</strong>
        </article>
        <article>
          <UsersRound />
          <span>Cashiers</span>
          <strong>{cashiers}</strong>
        </article>
        <article>
          <UsersRound />
          <span>Inventory</span>
          <strong>{inventory}</strong>
        </article>
      </section>

      <form className={styles.filters}>
        <label className={styles.searchField}>
          <Search size={16} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, username, employee ID..."
          />
        </label>

        <select name="role" defaultValue={role}>
          <option value="">All roles</option>
          <option value="OWNER">Owner</option>
          <option value="CASHIER">Cashier</option>
          <option value="INVENTORY">Inventory</option>
          <option value="ADMIN">System Admin</option>
        </select>

        <select name="status" defaultValue={status}>
          <option value="">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>

        <button type="submit">Apply</button>
        <Link href="/users">Clear</Link>
      </form>

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const protectedAdmin = user.role === "ADMIN";

                return (
                  <tr key={user.id}>
                    <td>{user.employee_id ?? "—"}</td>
                    <td>
                      <strong>{user.full_name}</strong>
                      {protectedAdmin ? <small>Protected account</small> : null}
                    </td>
                    <td>{user.username}</td>
                    <td>
                      <span className={`${styles.role} ${styles[user.role.toLowerCase()]}`}>
                        {user.role === "ADMIN" ? "SYSTEM ADMIN" : user.role}
                      </span>
                    </td>
                    <td>
                      <span className={user.is_active ? styles.active : styles.inactive}>
                        {user.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td>{formatDate(user.last_login_at)}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td className={styles.actions}>
                      {!protectedAdmin ? (
                        <>
                          <Link
                            href={`/users/${user.id}`}
                            className={styles.iconButton}
                            title="Edit user"
                          >
                            <Pencil size={16} />
                          </Link>

                          <form action={toggleUserStatusAction}>
                            <input type="hidden" name="id" value={user.id} />
                            <button
                              type="submit"
                              className={styles.iconButton}
                              title={user.is_active ? "Deactivate user" : "Activate user"}
                            >
                              {user.is_active ? (
                                <CircleOff size={16} />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                            </button>
                          </form>
                        </>
                      ) : (
                        <ShieldCheck size={18} className={styles.protectedIcon} />
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    No user accounts match the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
