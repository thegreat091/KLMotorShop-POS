import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Edit3,
  Plus,
  Search,
  UserCog,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleMechanicStatus } from "./actions";
import styles from "./mechanics.module.css";

interface MechanicRow extends RowDataPacket {
  id: number;
  mechanic_code: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  date_hired: Date | string | null;
  default_owner_percentage: number;
  default_mechanic_percentage: number;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MechanicsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function MechanicsPage({
  searchParams,
}: MechanicsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  const search = parameters.search?.trim() ?? "";
  const status = parameters.status?.trim().toUpperCase() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`
      (
        mechanic_code LIKE ?
        OR full_name LIKE ?
        OR contact_number LIKE ?
        OR email LIKE ?
        OR address LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  if (status === "ACTIVE") {
    conditions.push("is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [mechanics] = await pool.query<MechanicRow[]>(
    `
      SELECT
        id,
        mechanic_code,
        full_name,
        contact_number,
        email,
        address,
        date_hired,
        default_owner_percentage,
        default_mechanic_percentage,
        is_active,
        created_at,
        updated_at
      FROM mechanics
      ${whereClause}
      ORDER BY
        is_active DESC,
        full_name ASC
    `,
    values,
  );

  const activeCount = mechanics.filter(
    (mechanic) => mechanic.is_active === 1,
  ).length;

  const inactiveCount = mechanics.length - activeCount;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/dashboard" className={styles.backButton}>
            <ArrowLeft size={19} />
            Dashboard
          </Link>

          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}>
              <UserCog size={28} />
            </div>

            <div>
              <p>Service Management</p>
              <h1>Mechanics</h1>
              <span>
                Manage mechanics and their default service
                commission allocation.
              </span>
            </div>
          </div>
        </div>

        <Link href="/mechanics/new" className={styles.addButton}>
          <Plus size={20} />
          Add Mechanic
        </Link>
      </header>

      <section className={styles.content}>
        {parameters.success ? (
          <div className={styles.successMessage}>
            <BadgeCheck size={20} />
            {parameters.success}
          </div>
        ) : null}

        {parameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={20} />
            {parameters.error}
          </div>
        ) : null}

        <div className={styles.summaryGrid}>
          <article>
            <div className={styles.summaryIcon}>
              <UsersRound size={23} />
            </div>

            <div>
              <span>Total Mechanics</span>
              <strong>{mechanics.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Mechanics</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <WalletCards size={23} />
            </div>

            <div>
              <span>Default Sharing</span>
              <strong>20% / 80%</strong>
              <small>Owner / Mechanic</small>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Mechanic Directory</p>
              <h2>Registered mechanics</h2>
            </div>

            <span>{inactiveCount} inactive</span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search code, name, contact, email, or address"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/mechanics">Clear</Link>
          </form>

          {mechanics.length === 0 ? (
            <div className={styles.emptyState}>
              <UserCog size={48} />
              <strong>No mechanics found</strong>
              <span>
                Add a mechanic or change the current search
                filters.
              </span>

              <Link href="/mechanics/new">
                <Plus size={19} />
                Add Mechanic
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Mechanic</th>
                    <th>Contact</th>
                    <th>Date Hired</th>
                    <th>Owner Share</th>
                    <th>Mechanic Share</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {mechanics.map((mechanic) => {
                    const statusAction =
                      toggleMechanicStatus.bind(
                        null,
                        mechanic.id,
                        mechanic.is_active === 1 ? 0 : 1,
                      );

                    return (
                      <tr key={mechanic.id}>
                        <td>
                          <span className={styles.code}>
                            {mechanic.mechanic_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.mechanicName}>
                            <strong>{mechanic.full_name}</strong>
                            <span>
                              {mechanic.email || "No email"}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className={styles.contactCell}>
                            <strong>
                              {mechanic.contact_number || "—"}
                            </strong>
                            <span>
                              {mechanic.address || "No address"}
                            </span>
                          </div>
                        </td>

                        <td>{formatDate(mechanic.date_hired)}</td>

                        <td>
                          <span className={styles.ownerShare}>
                            {Number(
                              mechanic.default_owner_percentage,
                            ).toFixed(2)}
                            %
                          </span>
                        </td>

                        <td>
                          <span className={styles.mechanicShare}>
                            {Number(
                              mechanic.default_mechanic_percentage,
                            ).toFixed(2)}
                            %
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              mechanic.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {mechanic.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/mechanics/${mechanic.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  mechanic.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {mechanic.is_active === 1
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}