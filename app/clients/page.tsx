import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bike,
  Edit3,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleClientStatus } from "./actions";
import styles from "./clients.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
  mobile_number: string | null;
  remarks: string | null;
  is_active: number;
  motorcycle_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ClientsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}

function formatDate(value: Date | string): string {
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

export default async function ClientsPage({
  searchParams,
}: ClientsPageProps) {
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

  const parameters = await searchParams;

  const search = parameters.search?.trim() ?? "";
  const status =
    parameters.status?.trim().toUpperCase() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`
      (
        c.client_code LIKE ?
        OR c.client_name LIKE ?
        OR c.mobile_number LIKE ?
        OR c.remarks LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  if (status === "ACTIVE") {
    conditions.push("c.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("c.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [clients] = await pool.query<ClientRow[]>(
  `
    SELECT
      c.id,
      c.client_code,
      c.client_name,
      c.mobile_number,
      c.remarks,
      c.is_active,
      c.created_at,
      c.updated_at,
      COUNT(m.id) AS motorcycle_count
    FROM clients c
    LEFT JOIN motorcycles m
      ON m.client_id = c.id
    ${whereClause}
    GROUP BY
      c.id,
      c.client_code,
      c.client_name,
      c.mobile_number,
      c.remarks,
      c.is_active,
      c.created_at,
      c.updated_at
    ORDER BY
      c.is_active DESC,
      c.client_name ASC
  `,
  values,
);

  const activeCount = clients.filter(
    (client) => client.is_active === 1,
  ).length;

  const inactiveCount = clients.length - activeCount;

  const clientsWithMobile = clients.filter(
    (client) => Boolean(client.mobile_number),
  ).length;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link
            href="/dashboard"
            className={styles.backButton}
          >
            <ArrowLeft size={19} />
            Dashboard
          </Link>

          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}>
              <UsersRound size={28} />
            </div>

            <div>
              <p>Customer Management</p>
              <h1>Clients</h1>
              <span>
                Manage customer names and contact information for
                retail sales and job orders.
              </span>
            </div>
          </div>
        </div>

        <Link href="/clients/new" className={styles.addButton}>
          <Plus size={20} />
          Add Client
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
              <span>Total Clients</span>
              <strong>{clients.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Clients</span>
              <strong>{activeCount}</strong>
              <small>{inactiveCount} inactive</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <Phone size={23} />
            </div>

            <div>
              <span>With Mobile Number</span>
              <strong>{clientsWithMobile}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Client Directory</p>
              <h2>Registered clients</h2>
            </div>

            <span>
              Search using the client name or mobile number.
            </span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search client code, name, mobile, or remarks"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/clients">Clear</Link>
          </form>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <UsersRound size={48} />

              <strong>No clients found</strong>

              <span>
                Add a client or change the current search filters.
              </span>

              <Link href="/clients/new">
                <Plus size={19} />
                Add Client
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Client</th>
                    <th>Mobile Number</th>
                    <th>Remarks</th>
                    <th>Motorcycles</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {clients.map((client) => {
                    const statusAction =
                      toggleClientStatus.bind(
                        null,
                        client.id,
                        client.is_active === 1 ? 0 : 1,
                      );

                    return (
                      <tr key={client.id}>
                        <td>
                          <span className={styles.code}>
                            {client.client_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.clientCell}>
                            <div className={styles.avatar}>
                              <UserRound size={18} />
                            </div>

                            <div>
                              <strong>
                                {client.client_name}
                              </strong>

                              <span>
                                Created{" "}
                                {formatDate(client.created_at)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {client.mobile_number ? (
                            <span className={styles.mobileNumber}>
                              <Phone size={14} />
                              {client.mobile_number}
                            </span>
                          ) : (
                            <span className={styles.noValue}>
                              No mobile number
                            </span>
                          )}
                        </td>

                        <td>
                          <p className={styles.remarks}>
                            {client.remarks ||
                              "No remarks provided."}
                          </p>
                        </td>

                        <td>
                          <span className={styles.motorcycleCount}>
                            <Bike size={14} />
                            {client.motorcycle_count}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              client.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {client.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>{formatDate(client.updated_at)}</td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/clients/${client.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  client.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {client.is_active === 1
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