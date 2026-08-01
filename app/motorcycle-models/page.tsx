import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bike,
  Edit3,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleMotorcycleModelStatus } from "./actions";
import styles from "./motorcycle-models.module.css";

interface MotorcycleModelRow extends RowDataPacket {
  id: number;
  model_code: string;
  model_name: string;
  remarks: string | null;
  is_active: number;
  registered_motorcycles: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MotorcycleModelsPageProps {
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

export default async function MotorcycleModelsPage({
  searchParams,
}: MotorcycleModelsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
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
        mm.model_code LIKE ?
        OR mm.model_name LIKE ?
        OR mm.remarks LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    values.push(searchValue, searchValue, searchValue);
  }

  if (status === "ACTIVE") {
    conditions.push("mm.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("mm.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

 const [models] =
  await pool.query<MotorcycleModelRow[]>(
    `
      SELECT
        mm.id,
        mm.model_code,
        mm.model_name,
        mm.remarks,
        mm.is_active,
        mm.created_at,
        mm.updated_at,
        COUNT(m.id) AS registered_motorcycles
      FROM motorcycle_models mm
      LEFT JOIN motorcycles m
        ON m.model_id = mm.id
      ${whereClause}
      GROUP BY
        mm.id,
        mm.model_code,
        mm.model_name,
        mm.remarks,
        mm.is_active,
        mm.created_at,
        mm.updated_at
      ORDER BY
        mm.is_active DESC,
        mm.model_name ASC
    `,
    values,
  );

  const activeCount = models.filter(
    (model) => model.is_active === 1,
  ).length;

  const inactiveCount = models.length - activeCount;

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
              <p>Motorcycle Master Data</p>
              <h1>Motorcycle Models</h1>
              <span>
                Manage the motorcycle model names used in customer
                and job-order records.
              </span>
            </div>
          </div>
        </div>

        <Link
          href="/motorcycle-models/new"
          className={styles.addButton}
        >
          <Plus size={20} />
          Add Model
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
              <span>Total Models</span>
              <strong>{models.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Models</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <Ban size={23} />
            </div>

            <div>
              <span>Inactive Models</span>
              <strong>{inactiveCount}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Model Directory</p>
              <h2>Registered motorcycle models</h2>
            </div>

            <span>
              Use names such as R150, Click 125, or NMAX.
            </span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search model code, name, or remarks"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/motorcycle-models">Clear</Link>
          </form>

          {models.length === 0 ? (
            <div className={styles.emptyState}>
              <Bike size={48} />

              <strong>No motorcycle models found</strong>

              <span>
                Add a motorcycle model or change the current search
                filters.
              </span>

              <Link href="/motorcycle-models/new">
                <Plus size={19} />
                Add Model
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Motorcycle Model</th>
                    <th>Remarks</th>
                    <th>Registered Motorcycles</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {models.map((model) => {
                    const statusAction =
                      toggleMotorcycleModelStatus.bind(
                        null,
                        model.id,
                        model.is_active === 1 ? 0 : 1,
                      );

                    return (
                      <tr key={model.id}>
                        <td>
                          <span className={styles.code}>
                            {model.model_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.modelName}>
                            <strong>{model.model_name}</strong>

                            <span>
                              Created{" "}
                              {formatDate(model.created_at)}
                            </span>
                          </div>
                        </td>

                        <td>
                          <p className={styles.remarks}>
                            {model.remarks ||
                              "No remarks provided."}
                          </p>
                        </td>

                        <td>
                          <span className={styles.motorcycleCount}>
                            {model.registered_motorcycles}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              model.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {model.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>{formatDate(model.updated_at)}</td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/motorcycle-models/${model.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  model.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {model.is_active === 1
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