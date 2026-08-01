import type { RowDataPacket } from "mysql2";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Filter,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./activity-logs.module.css";

interface ActivityLogRow extends RowDataPacket {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  module: string;
  reference_table: string | null;
  reference_id: string | null;
  ip_address: string | null;
  created_at: Date | string;
}

interface ModuleRow extends RowDataPacket {
  module: string;
}

interface ActivityLogsPageProps {
  searchParams: Promise<{
    search?: string;
    module?: string;
    role?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getRoleClass(role: string | null): string {
  switch (role?.toUpperCase()) {
    case "ADMIN":
      return styles.adminBadge;

    case "OWNER":
      return styles.ownerBadge;

    case "CASHIER":
      return styles.cashierBadge;

    case "INVENTORY":
      return styles.inventoryBadge;

    default:
      return styles.defaultBadge;
  }
}

function buildPageUrl(
  parameters: Record<string, string>,
  page: number,
): string {
  const urlParameters = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (value) {
      urlParameters.set(key, value);
    }
  }

  urlParameters.set("page", String(page));

  return `/activity-logs?${urlParameters.toString()}`;
}

export default async function ActivityLogsPage({
  searchParams,
}: ActivityLogsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  const search = parameters.search?.trim() ?? "";
  const selectedModule = parameters.module?.trim() ?? "";
  const selectedRole = parameters.role?.trim().toUpperCase() ?? "";
  const dateFrom = parameters.date_from?.trim() ?? "";
  const dateTo = parameters.date_to?.trim() ?? "";

  const requestedPage = Number(parameters.page ?? "1");
  const currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`
      (
        al.user_name LIKE ?
        OR al.action LIKE ?
        OR al.module LIKE ?
        OR al.reference_table LIKE ?
        OR al.reference_id LIKE ?
        OR al.ip_address LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  if (selectedModule) {
    conditions.push("al.module = ?");
    values.push(selectedModule);
  }

  if (selectedRole) {
    conditions.push("UPPER(al.user_role) = ?");
    values.push(selectedRole);
  }

  if (dateFrom) {
    conditions.push("al.created_at >= ?");
    values.push(`${dateFrom} 00:00:00`);
  }

  if (dateTo) {
    conditions.push("al.created_at <= ?");
    values.push(`${dateTo} 23:59:59`);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [countRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM activity_logs al
      ${whereClause}
    `,
    values,
  );

  const totalLogs = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(
    1,
    Math.ceil(totalLogs / PAGE_SIZE),
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const offset = (safeCurrentPage - 1) * PAGE_SIZE;

  const [activityLogs] = await pool.query<ActivityLogRow[]>(
    `
      SELECT
        al.id,
        al.user_id,
        al.user_name,
        al.user_role,
        al.action,
        al.module,
        al.reference_table,
        al.reference_id,
        al.ip_address,
        al.created_at
      FROM activity_logs al
      ${whereClause}
      ORDER BY
        al.created_at DESC,
        al.id DESC
      LIMIT ? OFFSET ?
    `,
    [...values, PAGE_SIZE, offset],
  );

  const [moduleRows] = await pool.query<ModuleRow[]>(
    `
      SELECT DISTINCT module
      FROM activity_logs
      WHERE module IS NOT NULL
        AND module <> ''
      ORDER BY module ASC
    `,
  );

  const queryParameters = {
    search,
    module: selectedModule,
    role: selectedRole,
    date_from: dateFrom,
    date_to: dateTo,
  };

  const startRecord =
    totalLogs === 0 ? 0 : offset + 1;

  const endRecord = Math.min(
    offset + PAGE_SIZE,
    totalLogs,
  );

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
              <Activity size={28} />
            </div>

            <div>
              <p>Administration</p>
              <h1>Activity Logs</h1>
              <span>
                Review user actions and important system events.
              </span>
            </div>
          </div>
        </div>

        <div className={styles.accessBadge}>
          <ShieldCheck size={19} />
          Read-only audit records
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.summaryGrid}>
          <article>
            <div className={styles.summaryIcon}>
              <Activity size={23} />
            </div>

            <div>
              <span>Total matching records</span>
              <strong>
                {totalLogs.toLocaleString("en-PH")}
              </strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <UserRound size={23} />
            </div>

            <div>
              <span>Current viewer</span>
              <strong>{user.fullName}</strong>
              <small>{user.role}</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <CalendarDays size={23} />
            </div>

            <div>
              <span>Current page</span>
              <strong>
                {safeCurrentPage} of {totalPages}
              </strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Audit Trail</p>
              <h2>System activity history</h2>
            </div>

            <span>
              Showing {startRecord}–{endRecord} of{" "}
              {totalLogs.toLocaleString("en-PH")}
            </span>
          </header>

          <form
            method="get"
            className={styles.filters}
          >
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search user, action, module, reference, or IP"
              />
            </label>

            <label className={styles.filterField}>
              <span>Module</span>

              <select
                name="module"
                defaultValue={selectedModule}
              >
                <option value="">All modules</option>

                {moduleRows.map((moduleRow) => (
                  <option
                    key={moduleRow.module}
                    value={moduleRow.module}
                  >
                    {moduleRow.module}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Role</span>

              <select
                name="role"
                defaultValue={selectedRole}
              >
                <option value="">All roles</option>
                <option value="ADMIN">Administrator</option>
                <option value="OWNER">Owner</option>
                <option value="CASHIER">Cashier</option>
                <option value="INVENTORY">
                  Inventory Staff
                </option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Date from</span>

              <input
                type="date"
                name="date_from"
                defaultValue={dateFrom}
              />
            </label>

            <label className={styles.filterField}>
              <span>Date to</span>

              <input
                type="date"
                name="date_to"
                defaultValue={dateTo}
              />
            </label>

            <div className={styles.filterActions}>
              <button type="submit">
                <Filter size={18} />
                Apply Filters
              </button>

              <Link href="/activity-logs">
                Clear
              </Link>
            </div>
          </form>

          {activityLogs.length === 0 ? (
            <div className={styles.emptyState}>
              <Activity size={48} />

              <strong>No activity logs found</strong>

              <span>
                No records match the selected search and filters.
              </span>

              <Link href="/activity-logs">
                Clear Filters
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date and Time</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Module</th>
                      <th>Action</th>
                      <th>Reference</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activityLogs.map((activityLog) => (
                      <tr key={activityLog.id}>
                        <td>
                          <span className={styles.dateTime}>
                            {formatDateTime(
                              activityLog.created_at,
                            )}
                          </span>
                        </td>

                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.avatar}>
                              <UserRound size={17} />
                            </div>

                            <div>
                              <strong>
                                {activityLog.user_name ||
                                  "System"}
                              </strong>

                              <span>
                                {activityLog.user_id
                                  ? `User #${activityLog.user_id}`
                                  : "Automated event"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={getRoleClass(
                              activityLog.user_role,
                            )}
                          >
                            {activityLog.user_role ||
                              "SYSTEM"}
                          </span>
                        </td>

                        <td>
                          <span className={styles.moduleBadge}>
                            {activityLog.module}
                          </span>
                        </td>

                        <td>
                          <p className={styles.actionText}>
                            {activityLog.action}
                          </p>
                        </td>

                        <td>
                          {activityLog.reference_table ||
                          activityLog.reference_id ? (
                            <div className={styles.referenceCell}>
                              <strong>
                                {activityLog.reference_table ||
                                  "Record"}
                              </strong>

                              <span>
                                {activityLog.reference_id
                                  ? `#${activityLog.reference_id}`
                                  : "—"}
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td>
                          <span className={styles.ipAddress}>
                            {activityLog.ip_address || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className={styles.pagination}>
                <span>
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <div>
                  {safeCurrentPage > 1 ? (
                    <Link
                      href={buildPageUrl(
                        queryParameters,
                        safeCurrentPage - 1,
                      )}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className={styles.disabledButton}>
                      Previous
                    </span>
                  )}

                  {safeCurrentPage < totalPages ? (
                    <Link
                      href={buildPageUrl(
                        queryParameters,
                        safeCurrentPage + 1,
                      )}
                    >
                      Next
                    </Link>
                  ) : (
                    <span className={styles.disabledButton}>
                      Next
                    </span>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>
      </section>
    </main>
  );
}