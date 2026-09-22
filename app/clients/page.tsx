import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bike,
  Eye,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleClientStatus } from "./actions";
import ConfirmStatusButton from "./ConfirmStatusButton";
import styles from "./clients.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
  mobile_number: string | null;
  remarks: string | null;
  is_active: number;
  motorcycle_count: number;
  job_order_count: number;
  sales_count: number;
  last_activity: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SummaryRow extends RowDataPacket {
  total_clients: number;
  active_clients: number;
  inactive_clients: number;
  with_motorcycles: number;
  job_order_customers: number;
  returning_customers: number;
}

interface ClientsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function ClientsPage({
  searchParams,
}: ClientsPageProps) {
  const user = await getCurrentUser();

  if (!user) redirect("/");
  if (!["ADMIN", "OWNER", "CASHIER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const parameters = await searchParams;
  const search = parameters.search?.trim() ?? "";
  const status = parameters.status?.trim().toUpperCase() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    const searchValue = `%${search}%`;
    conditions.push(`
      (
        c.client_code LIKE ?
        OR c.client_name LIKE ?
        OR c.mobile_number LIKE ?
        OR c.remarks LIKE ?
        OR m.plate_number LIKE ?
        OR mm.model_name LIKE ?
      )
    `);
    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  if (status === "ACTIVE") conditions.push("c.is_active = 1");
  if (status === "INACTIVE") conditions.push("c.is_active = 0");

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const [clientsResult, summaryResult] = await Promise.all([
    pool.query<ClientRow[]>(
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
          COUNT(DISTINCT m.id) AS motorcycle_count,
          COUNT(DISTINCT jo.id) AS job_order_count,
          COUNT(DISTINCT s.id) AS sales_count,
          MAX(
            GREATEST(
              COALESCE(jo.date_received, '1000-01-01'),
              COALESCE(s.sale_date, '1000-01-01')
            )
          ) AS last_activity
        FROM clients c
        LEFT JOIN motorcycles m
          ON m.client_id = c.id
        LEFT JOIN motorcycle_models mm
          ON mm.id = m.model_id
        LEFT JOIN job_orders jo
          ON jo.client_id = c.id
        LEFT JOIN sales s
          ON s.client_id = c.id
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
          last_activity DESC,
          c.client_name ASC
      `,
      values,
    ),
    pool.query<SummaryRow[]>(
      `
        SELECT
          COUNT(*) AS total_clients,
          SUM(c.is_active = 1) AS active_clients,
          SUM(c.is_active = 0) AS inactive_clients,
          COUNT(DISTINCT CASE WHEN m.id IS NOT NULL THEN c.id END) AS with_motorcycles,
          COUNT(DISTINCT CASE WHEN jo.id IS NOT NULL THEN c.id END) AS job_order_customers,
          COUNT(
            DISTINCT CASE
              WHEN activity.activity_count >= 2 THEN c.id
            END
          ) AS returning_customers
        FROM clients c
        LEFT JOIN motorcycles m
          ON m.client_id = c.id
        LEFT JOIN job_orders jo
          ON jo.client_id = c.id
        LEFT JOIN (
          SELECT
            client_id,
            COUNT(*) AS activity_count
          FROM (
            SELECT client_id, id FROM job_orders WHERE client_id IS NOT NULL
            UNION ALL
            SELECT client_id, id FROM sales WHERE client_id IS NOT NULL
          ) activity_rows
          GROUP BY client_id
        ) activity
          ON activity.client_id = c.id
      `,
    ),
  ]);

  const clients = clientsResult[0];
  const summary = summaryResult[0][0] ?? {
    total_clients: 0,
    active_clients: 0,
    inactive_clients: 0,
    with_motorcycles: 0,
    job_order_customers: 0,
    returning_customers: 0,
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/dashboard" className={styles.backButton}>
            <ArrowLeft size={17} />
            Dashboard
          </Link>

          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}>
              <UsersRound size={27} />
            </div>

            <div>
              <p>Customer Management</p>
              <h1>Clients</h1>
              <span>
                Manage customers, motorcycles, workshop history, and retail
                transactions in one place.
              </span>
            </div>
          </div>
        </div>

        <Link href="/clients/new" className={styles.addButton}>
          <Plus size={19} />
          Add Client
        </Link>
      </header>

      <section className={styles.content}>
        {parameters.success ? (
          <div className={styles.successMessage}>
            <BadgeCheck size={19} />
            {parameters.success}
          </div>
        ) : null}

        {parameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={19} />
            {parameters.error}
          </div>
        ) : null}

        <section className={styles.summaryGrid}>
          <article>
            <div className={styles.summaryIcon}><UsersRound size={21} /></div>
            <div>
              <span>Total Clients</span>
              <strong>{Number(summary.total_clients)}</strong>
              <small>{Number(summary.active_clients)} active</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}><BadgeCheck size={21} /></div>
            <div>
              <span>Active Clients</span>
              <strong>{Number(summary.active_clients)}</strong>
              <small>{Number(summary.inactive_clients)} inactive</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}><Bike size={21} /></div>
            <div>
              <span>With Motorcycles</span>
              <strong>{Number(summary.with_motorcycles)}</strong>
              <small>Registered motorcycle owners</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}><Wrench size={21} /></div>
            <div>
              <span>Job Order Customers</span>
              <strong>{Number(summary.job_order_customers)}</strong>
              <small>Customers with workshop history</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}><UserRound size={21} /></div>
            <div>
              <span>Returning Customers</span>
              <strong>{Number(summary.returning_customers)}</strong>
              <small>2 or more sales / job orders</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}><Phone size={21} /></div>
            <div>
              <span>With Mobile Number</span>
              <strong>
                {clients.filter((client) => Boolean(client.mobile_number)).length}
              </strong>
              <small>Among current results</small>
            </div>
          </article>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Client Directory</p>
              <h2>Registered clients</h2>
            </div>
            <span>
              Search by client, mobile, plate number, or motorcycle model.
            </span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={18} />
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search name, code, mobile, plate number, model, or remarks"
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

          <div className={styles.resultsBar}>
            <span>
              Showing <strong>{clients.length}</strong>{" "}
              {clients.length === 1 ? "client" : "clients"}
            </span>
            <span>
              {status === "ALL" ? "All statuses" : status === "ACTIVE" ? "Active clients" : "Inactive clients"}
            </span>
          </div>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <UsersRound size={45} />
              <strong>No clients found</strong>
              <span>
                Try another search or add a new client to the directory.
              </span>
              <Link href="/clients/new">
                <Plus size={18} />
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
                    <th>Mobile</th>
                    <th>Motorcycles</th>
                    <th>Workshop</th>
                    <th>Sales</th>
                    <th>Last Visit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {clients.map((client) => {
                    const statusAction = toggleClientStatus.bind(
                      null,
                      client.id,
                      client.is_active === 1 ? 0 : 1,
                    );

                    return (
                      <tr key={client.id}>
                        <td>
                          <span className={styles.code}>{client.client_code}</span>
                        </td>

                        <td>
                          <div className={styles.clientCell}>
                            <div className={styles.avatar}>
                              <UserRound size={17} />
                            </div>
                            <div>
                              <Link
                                href={`/clients/${client.id}/view`}
                                className={styles.clientName}
                              >
                                {client.client_name}
                              </Link>
                              <span>Created {formatDate(client.created_at)}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {client.mobile_number ? (
                            <span className={styles.mobileNumber}>
                              <Phone size={13} />
                              {client.mobile_number}
                            </span>
                          ) : (
                            <span className={styles.noValue}>No mobile</span>
                          )}
                        </td>

                        <td>
                          <Link
                            href={`/clients/${client.id}/view#motorcycles`}
                            className={styles.motorcycleCount}
                          >
                            <Bike size={13} />
                            {Number(client.motorcycle_count)}
                          </Link>
                        </td>

                        <td>
                          <span className={styles.historyValue}>
                            <Wrench size={13} />
                            {Number(client.job_order_count)}
                          </span>
                        </td>

                        <td>
                          <span className={styles.historyValue}>
                            {Number(client.sales_count)}
                          </span>
                        </td>

                        <td>
                          <div className={styles.lastVisit}>
                            <strong>{formatDate(client.last_activity)}</strong>
                            <small>
                              {client.last_activity
                                ? formatDateTime(client.last_activity).split(", ").slice(-1)[0]
                                : "No activity yet"}
                            </small>
                          </div>
                        </td>

                        <td>
                          <span
                            className={
                              client.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {client.is_active === 1 ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/clients/${client.id}/view`}
                              className={styles.viewButton}
                            >
                              <Eye size={15} />
                              View
                            </Link>

                            <Link
                              href={`/clients/${client.id}`}
                              className={styles.editButton}
                            >
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <ConfirmStatusButton
                                active={client.is_active === 1}
                                clientName={client.client_name}
                              />
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
