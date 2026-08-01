import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bike,
  Edit3,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleMotorcycleStatus } from "./actions";
import styles from "./motorcycles.module.css";

interface MotorcycleRow extends RowDataPacket {
  id: number;
  motorcycle_code: string;
  plate_number: string;
  client_id: number;
  client_code: string;
  client_name: string;
  model_id: number;
  model_code: string;
  model_name: string;
  remarks: string | null;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MotorcyclesPageProps {
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

export default async function MotorcyclesPage({
  searchParams,
}: MotorcyclesPageProps) {
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
        m.motorcycle_code LIKE ?
        OR m.plate_number LIKE ?
        OR c.client_code LIKE ?
        OR c.client_name LIKE ?
        OR mm.model_code LIKE ?
        OR mm.model_name LIKE ?
        OR m.remarks LIKE ?
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
      searchValue,
    );
  }

  if (status === "ACTIVE") {
    conditions.push("m.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("m.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [motorcycles] = await pool.query<MotorcycleRow[]>(
    `
      SELECT
        m.id,
        m.motorcycle_code,
        m.plate_number,
        m.client_id,
        c.client_code,
        c.client_name,
        m.model_id,
        mm.model_code,
        mm.model_name,
        m.remarks,
        m.is_active,
        m.created_at,
        m.updated_at
      FROM motorcycles m
      INNER JOIN clients c
        ON c.id = m.client_id
      INNER JOIN motorcycle_models mm
        ON mm.id = m.model_id
      ${whereClause}
      ORDER BY
        m.is_active DESC,
        m.plate_number ASC
    `,
    values,
  );

  const activeCount = motorcycles.filter(
    (motorcycle) => motorcycle.is_active === 1,
  ).length;

  const inactiveCount = motorcycles.length - activeCount;

  const uniqueClients = new Set(
    motorcycles.map((motorcycle) => motorcycle.client_id),
  ).size;

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
              <Bike size={28} />
            </div>

            <div>
              <p>Customer Management</p>
              <h1>Motorcycles</h1>
              <span>
                Register client motorcycles using only the plate
                number and motorcycle model.
              </span>
            </div>
          </div>
        </div>

        <Link
          href="/motorcycles/new"
          className={styles.addButton}
        >
          <Plus size={20} />
          Add Motorcycle
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
              <Bike size={23} />
            </div>

            <div>
              <span>Total Motorcycles</span>
              <strong>{motorcycles.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Motorcycles</span>
              <strong>{activeCount}</strong>
              <small>{inactiveCount} inactive</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <UserRound size={23} />
            </div>

            <div>
              <span>Registered Owners</span>
              <strong>{uniqueClients}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Motorcycle Directory</p>
              <h2>Registered client motorcycles</h2>
            </div>

            <span>
              Search by plate, owner, model, or motorcycle code.
            </span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search plate, client, model, or code"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/motorcycles">Clear</Link>
          </form>

          {motorcycles.length === 0 ? (
            <div className={styles.emptyState}>
              <Bike size={48} />

              <strong>No motorcycles found</strong>

              <span>
                Add a motorcycle or change the current search
                filters.
              </span>

              <Link href="/motorcycles/new">
                <Plus size={19} />
                Add Motorcycle
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Plate Number</th>
                    <th>Client</th>
                    <th>Motorcycle Model</th>
                    <th>Remarks</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {motorcycles.map((motorcycle) => {
                    const statusAction =
                      toggleMotorcycleStatus.bind(
                        null,
                        motorcycle.id,
                        motorcycle.is_active === 1 ? 0 : 1,
                      );

                    return (
                      <tr key={motorcycle.id}>
                        <td>
                          <span className={styles.code}>
                            {motorcycle.motorcycle_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.plateCell}>
                            <Bike size={18} />

                            <div>
                              <strong>
                                {motorcycle.plate_number}
                              </strong>

                              <span>
                                Created{" "}
                                {formatDate(
                                  motorcycle.created_at,
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className={styles.clientCell}>
                            <strong>
                              {motorcycle.client_name}
                            </strong>

                            <span>
                              {motorcycle.client_code}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className={styles.modelCell}>
                            <strong>
                              {motorcycle.model_name}
                            </strong>

                            <span>
                              {motorcycle.model_code}
                            </span>
                          </div>
                        </td>

                        <td>
                          <p className={styles.remarks}>
                            {motorcycle.remarks ||
                              "No remarks provided."}
                          </p>
                        </td>

                        <td>
                          <span
                            className={
                              motorcycle.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {motorcycle.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>
                          {formatDate(motorcycle.updated_at)}
                        </td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/motorcycles/${motorcycle.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  motorcycle.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {motorcycle.is_active === 1
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