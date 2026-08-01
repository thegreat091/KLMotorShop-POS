import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  Edit3,
  Eye,
  Phone,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleSupplierStatus } from "./actions";
import styles from "./suppliers.module.css";

interface SupplierRow extends RowDataPacket {
  id: number;
  supplier_code: string;
  supplier_name: string;
  contact_person: string | null;
  mobile_number: string | null;
  telephone_number: string | null;
  address: string | null;
  remarks: string | null;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SuppliersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}

function formatDate(value: Date | string): string {
  const date =
    value instanceof Date ? value : new Date(value);

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

export default async function SuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const canViewSuppliers =
    user.role === "ADMIN" ||
    user.role === "INVENTORY" ||
    user.role === "OWNER" ||
    user.role === "CASHIER";

  if (!canViewSuppliers) {
    redirect("/dashboard");
  }

  const canManageSuppliers =
    user.role === "ADMIN" ||
    user.role === "INVENTORY";

  const parameters = await searchParams;

  const search = parameters.search?.trim() ?? "";
  const status =
    parameters.status?.trim().toUpperCase() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`
      (
        s.supplier_code LIKE ?
        OR s.supplier_name LIKE ?
        OR s.contact_person LIKE ?
        OR s.mobile_number LIKE ?
        OR s.telephone_number LIKE ?
        OR s.address LIKE ?
        OR s.remarks LIKE ?
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
    conditions.push("s.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("s.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [suppliers] = await pool.query<SupplierRow[]>(
    `
      SELECT
        s.id,
        s.supplier_code,
        s.supplier_name,
        s.contact_person,
        s.mobile_number,
        s.telephone_number,
        s.address,
        s.remarks,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM suppliers s
      ${whereClause}
      ORDER BY
        s.is_active DESC,
        s.supplier_name ASC
    `,
    values,
  );

  const activeCount = suppliers.filter(
    (supplier) => supplier.is_active === 1,
  ).length;

  const inactiveCount =
    suppliers.length - activeCount;

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
              <Building2 size={28} />
            </div>

            <div>
              <p>Inventory Master Data</p>
              <h1>Suppliers</h1>
              <span>
                Manage suppliers for motorcycle parts,
                accessories, oils, and inventory purchases.
              </span>
            </div>
          </div>
        </div>

        {canManageSuppliers ? (
          <Link
            href="/suppliers/new"
            className={styles.addButton}
          >
            <Plus size={20} />
            Add Supplier
          </Link>
        ) : (
          <span className={styles.viewOnlyBadge}>
            <Eye size={18} />
            View only
          </span>
        )}
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
              <Building2 size={23} />
            </div>

            <div>
              <span>Total Suppliers</span>
              <strong>{suppliers.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Suppliers</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <Ban size={23} />
            </div>

            <div>
              <span>Inactive Suppliers</span>
              <strong>{inactiveCount}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Supplier Directory</p>
              <h2>Registered suppliers</h2>
            </div>

            <span>
              Search using supplier name, contact person,
              mobile number, or telephone.
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
                placeholder="Search supplier code, name, contact, or number"
              />
            </label>

            <select
              name="status"
              defaultValue={status}
            >
              <option value="ALL">
                All statuses
              </option>
              <option value="ACTIVE">
                Active only
              </option>
              <option value="INACTIVE">
                Inactive only
              </option>
            </select>

            <button type="submit">
              Search
            </button>

            <Link href="/suppliers">
              Clear
            </Link>
          </form>

          {suppliers.length === 0 ? (
            <div className={styles.emptyState}>
              <Building2 size={48} />

              <strong>No suppliers found</strong>

              <span>
                Add a supplier or change the current
                search filters.
              </span>

              {canManageSuppliers ? (
                <Link href="/suppliers/new">
                  <Plus size={19} />
                  Add Supplier
                </Link>
              ) : null}
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Supplier</th>
                    <th>Contact Person</th>
                    <th>Mobile Number</th>
                    <th>Telephone</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {suppliers.map((supplier) => {
                    const statusAction =
                      toggleSupplierStatus.bind(
                        null,
                        supplier.id,
                        supplier.is_active === 1
                          ? 0
                          : 1,
                      );

                    return (
                      <tr key={supplier.id}>
                        <td>
                          <span className={styles.code}>
                            {supplier.supplier_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.supplierCell}>
                            <div className={styles.supplierIcon}>
                              <Building2 size={18} />
                            </div>

                            <div>
                              <strong>
                                {supplier.supplier_name}
                              </strong>

                              <span>
                                {supplier.remarks ||
                                  `Created ${formatDate(
                                    supplier.created_at,
                                  )}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {supplier.contact_person ? (
                            <span className={styles.contactPerson}>
                              <UserRound size={14} />
                              {supplier.contact_person}
                            </span>
                          ) : (
                            <span className={styles.noValue}>
                              No contact person
                            </span>
                          )}
                        </td>

                        <td>
                          {supplier.mobile_number ? (
                            <span className={styles.phoneNumber}>
                              <Phone size={14} />
                              {supplier.mobile_number}
                            </span>
                          ) : (
                            <span className={styles.noValue}>
                              —
                            </span>
                          )}
                        </td>

                        <td>
                          {supplier.telephone_number ? (
                            <span className={styles.phoneNumber}>
                              <Phone size={14} />
                              {supplier.telephone_number}
                            </span>
                          ) : (
                            <span className={styles.noValue}>
                              —
                            </span>
                          )}
                        </td>

                        <td>
                          <p className={styles.address}>
                            {supplier.address ||
                              "No address provided."}
                          </p>
                        </td>

                        <td>
                          <span
                            className={
                              supplier.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {supplier.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>
                          {formatDate(
                            supplier.updated_at,
                          )}
                        </td>

                        <td>
                          {canManageSuppliers ? (
                            <div className={styles.rowActions}>
                              <Link
                                href={`/suppliers/${supplier.id}`}
                                className={styles.editButton}
                              >
                                <Edit3 size={17} />
                                Edit
                              </Link>

                              <form action={statusAction}>
                                <button
                                  type="submit"
                                  className={
                                    supplier.is_active === 1
                                      ? styles.deactivateButton
                                      : styles.activateButton
                                  }
                                >
                                  {supplier.is_active === 1
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                              </form>
                            </div>
                          ) : (
                            <span className={styles.viewOnlyText}>
                              View only
                            </span>
                          )}
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