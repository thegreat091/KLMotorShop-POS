import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Edit3,
  Globe2,
  Plus,
  Search,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleBrandStatus } from "./actions";
import styles from "./brands.module.css";

interface BrandRow extends RowDataPacket {
  id: number;
  brand_code: string;
  brand_name: string;
  description: string | null;
  country_of_origin: string | null;
  website: string | null;
  is_active: number;
  product_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BrandsPageProps {
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

function normalizeWebsite(website: string): string {
  if (
    website.startsWith("http://") ||
    website.startsWith("https://")
  ) {
    return website;
  }

  return `https://${website}`;
}

export default async function BrandsPage({
  searchParams,
}: BrandsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
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
        pb.brand_code LIKE ?
        OR pb.brand_name LIKE ?
        OR pb.description LIKE ?
        OR pb.country_of_origin LIKE ?
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
    conditions.push("pb.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("pb.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [brands] = await pool.query<BrandRow[]>(
    `
      SELECT
        pb.id,
        pb.brand_code,
        pb.brand_name,
        pb.description,
        pb.country_of_origin,
        pb.website,
        pb.is_active,
        pb.created_at,
        pb.updated_at,
        0 AS product_count
      FROM product_brands pb
      ${whereClause}
      ORDER BY
        pb.is_active DESC,
        pb.brand_name ASC
    `,
    values,
  );

  const activeCount = brands.filter(
    (brand) => brand.is_active === 1,
  ).length;

  const inactiveCount = brands.filter(
    (brand) => brand.is_active !== 1,
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
              <Tags size={28} />
            </div>

            <div>
              <p>Inventory Master Data</p>
              <h1>Product Brands</h1>
              <span>
                Manage motorcycle parts, accessories, and
                lubricant brands.
              </span>
            </div>
          </div>
        </div>

        <Link href="/brands/new" className={styles.addButton}>
          <Plus size={20} />
          Add Brand
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
              <Tags size={23} />
            </div>

            <div>
              <span>Total Brands</span>
              <strong>{brands.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <BadgeCheck size={23} />
            </div>

            <div>
              <span>Active Brands</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <Ban size={23} />
            </div>

            <div>
              <span>Inactive Brands</span>
              <strong>{inactiveCount}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Brand Directory</p>
              <h2>All product brands</h2>
            </div>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search code, name, country, or description"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/brands">Clear</Link>
          </form>

          {brands.length === 0 ? (
            <div className={styles.emptyState}>
              <Tags size={47} />

              <strong>No brands found</strong>

              <span>
                Add a new brand or change the current search
                filters.
              </span>

              <Link href="/brands/new">
                <Plus size={19} />
                Add Brand
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Brand</th>
                    <th>Description</th>
                    <th>Country</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th className={styles.actionsColumn}>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {brands.map((brand) => {
                    const nextStatus =
                      brand.is_active === 1 ? 0 : 1;

                    const statusAction =
                      toggleBrandStatus.bind(
                        null,
                        brand.id,
                        nextStatus,
                      );

                    return (
                      <tr key={brand.id}>
                        <td>
                          <span className={styles.code}>
                            {brand.brand_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.brandName}>
                            <strong>{brand.brand_name}</strong>

                            {brand.website ? (
                              <a
                                href={normalizeWebsite(
                                  brand.website,
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Globe2 size={13} />
                                Website
                              </a>
                            ) : (
                              <span>
                                Created{" "}
                                {formatDate(brand.created_at)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <p className={styles.description}>
                            {brand.description ||
                              "No description provided."}
                          </p>
                        </td>

                        <td>
                          {brand.country_of_origin || "—"}
                        </td>

                        <td>
                          <span className={styles.productCount}>
                            {brand.product_count}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              brand.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {brand.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>{formatDate(brand.updated_at)}</td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/brands/${brand.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  brand.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {brand.is_active === 1
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