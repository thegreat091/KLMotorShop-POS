import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Clock3,
  Edit3,
  Plus,
  Search,
  Settings2,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleServiceStatus } from "./actions";
import styles from "./services.module.css";

interface ServiceRow extends RowDataPacket {
  id: number;
  service_code: string;
  service_name: string;
  description: string | null;
  service_charge: number;
  owner_percentage: number;
  mechanic_percentage: number;
  estimated_minutes: number | null;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ServicesPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
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

function formatDuration(minutes: number | null): string {
  if (!minutes) {
    return "Not specified";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

export default async function ServicesPage({
  searchParams,
}: ServicesPageProps) {
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
        service_code LIKE ?
        OR service_name LIKE ?
        OR description LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    values.push(searchValue, searchValue, searchValue);
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

  const [services] = await pool.query<ServiceRow[]>(
    `
      SELECT
        id,
        service_code,
        service_name,
        description,
        service_charge,
        owner_percentage,
        mechanic_percentage,
        estimated_minutes,
        is_active,
        created_at,
        updated_at
      FROM services
      ${whereClause}
      ORDER BY
        is_active DESC,
        service_name ASC
    `,
    values,
  );

  const activeCount = services.filter(
    (service) => service.is_active === 1,
  ).length;

  const inactiveCount = services.length - activeCount;

  const averageServiceCharge =
    services.length > 0
      ? services.reduce(
          (total, service) =>
            total + Number(service.service_charge),
          0,
        ) / services.length
      : 0;

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
              <Wrench size={28} />
            </div>

            <div>
              <p>Service Management</p>
              <h1>Service List</h1>
              <span>
                Configure labor charges and owner-mechanic
                allocation.
              </span>
            </div>
          </div>
        </div>

        <Link href="/services/new" className={styles.addButton}>
          <Plus size={20} />
          Add Service
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
              <Settings2 size={23} />
            </div>

            <div>
              <span>Total Services</span>
              <strong>{services.length}</strong>
              <small>{inactiveCount} inactive</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Services</span>
              <strong>{activeCount}</strong>
              <small>Available for transactions</small>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <WalletCards size={23} />
            </div>

            <div>
              <span>Average Service Charge</span>
              <strong>
                {formatCurrency(averageServiceCharge)}
              </strong>
              <small>Current filtered services</small>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Service Directory</p>
              <h2>Available labor services</h2>
            </div>

            <span>Default sharing: 20% owner / 80% mechanic</span>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search service code, name, or description"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/services">Clear</Link>
          </form>

          {services.length === 0 ? (
            <div className={styles.emptyState}>
              <Wrench size={48} />

              <strong>No services found</strong>

              <span>
                Add a service or change the current filters.
              </span>

              <Link href="/services/new">
                <Plus size={19} />
                Add Service
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Service</th>
                    <th>Charge</th>
                    <th>Owner</th>
                    <th>Mechanic</th>
                    <th>Estimated Time</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {services.map((service) => {
                    const serviceCharge = Number(
                      service.service_charge,
                    );

                    const ownerPercentage = Number(
                      service.owner_percentage,
                    );

                    const mechanicPercentage = Number(
                      service.mechanic_percentage,
                    );

                    const ownerAmount =
                      serviceCharge *
                      (ownerPercentage / 100);

                    const mechanicAmount =
                      serviceCharge *
                      (mechanicPercentage / 100);

                    const statusAction =
                      toggleServiceStatus.bind(
                        null,
                        service.id,
                        service.is_active === 1 ? 0 : 1,
                      );

                    return (
                      <tr key={service.id}>
                        <td>
                          <span className={styles.code}>
                            {service.service_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.serviceName}>
                            <strong>
                              {service.service_name}
                            </strong>

                            <span>
                              {service.description ||
                                "No description provided."}
                            </span>
                          </div>
                        </td>

                        <td>
                          <strong className={styles.charge}>
                            {formatCurrency(serviceCharge)}
                          </strong>
                        </td>

                        <td>
                          <div className={styles.shareCell}>
                            <strong>
                              {formatCurrency(ownerAmount)}
                            </strong>

                            <span>
                              {ownerPercentage.toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className={styles.shareCell}>
                            <strong>
                              {formatCurrency(mechanicAmount)}
                            </strong>

                            <span>
                              {mechanicPercentage.toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className={styles.duration}>
                            <Clock3 size={15} />
                            {formatDuration(
                              service.estimated_minutes,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              service.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {service.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>
                          {formatDate(service.updated_at)}
                        </td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/services/${service.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  service.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {service.is_active === 1
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