import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleOff,
  Edit3,
  FolderPlus,
  Search,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleCategoryStatus } from "./actions";
import styles from "./categories.module.css";

interface CategoryRow extends RowDataPacket {
  id: number;
  category_code: string;
  category_name: string;
  description: string | null;
  is_active: number;
  product_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CategoriesPageProps {
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
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  const search = parameters.search?.trim() ?? "";
  const status = parameters.status?.trim() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`
      (
        pc.category_code LIKE ?
        OR pc.category_name LIKE ?
        OR pc.description LIKE ?
      )
    `);

    const searchValue = `%${search}%`;
    values.push(searchValue, searchValue, searchValue);
  }

  if (status === "ACTIVE") {
    conditions.push("pc.is_active = 1");
  }

  if (status === "INACTIVE") {
    conditions.push("pc.is_active = 0");
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [categories] = await pool.query<CategoryRow[]>(
    `
      SELECT
        pc.id,
        pc.category_code,
        pc.category_name,
        pc.description,
        pc.is_active,
        pc.created_at,
        pc.updated_at,
        0 AS product_count
      FROM product_categories pc
      ${whereClause}
      ORDER BY
        pc.is_active DESC,
        pc.category_name ASC
    `,
    values,
  );

  const activeCount = categories.filter(
    (category) => category.is_active === 1,
  ).length;

  const inactiveCount = categories.filter(
    (category) => category.is_active !== 1,
  ).length;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
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
              <Tags size={27} />
            </div>

            <div>
              <p>Inventory Master Data</p>
              <h1>Product Categories</h1>
              <span>
                Organize motorcycle parts and accessories into
                manageable product groups.
              </span>
            </div>
          </div>
        </div>

        <Link href="/categories/new" className={styles.addButton}>
          <FolderPlus size={20} />
          Add Category
        </Link>
      </header>

      <section className={styles.content}>
        {parameters.success ? (
          <div className={styles.successMessage}>
            <CheckCircle2 size={20} />
            {parameters.success}
          </div>
        ) : null}

        {parameters.error ? (
          <div className={styles.errorMessage}>
            <CircleOff size={20} />
            {parameters.error}
          </div>
        ) : null}

        <div className={styles.summaryGrid}>
          <article>
            <div className={styles.summaryIcon}>
              <Boxes size={23} />
            </div>

            <div>
              <span>Total Categories</span>
              <strong>{categories.length}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <CheckCircle2 size={23} />
            </div>

            <div>
              <span>Active Categories</span>
              <strong>{activeCount}</strong>
            </div>
          </article>

          <article>
            <div className={styles.summaryIcon}>
              <CircleOff size={23} />
            </div>

            <div>
              <span>Inactive Categories</span>
              <strong>{inactiveCount}</strong>
            </div>
          </article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Category Directory</p>
              <h2>All product categories</h2>
            </div>
          </header>

          <form method="get" className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={19} />

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search code, name, or description"
              />
            </label>

            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>

            <button type="submit">Search</button>

            <Link href="/categories">Clear</Link>
          </form>

          {categories.length === 0 ? (
            <div className={styles.emptyState}>
              <Tags size={46} />
              <strong>No categories found</strong>
              <span>
                Add a new category or change the current search
                filters.
              </span>

              <Link href="/categories/new">
                <FolderPlus size={19} />
                Add Category
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th className={styles.actionsColumn}>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {categories.map((category) => {
                    const nextStatus =
                      category.is_active === 1 ? 0 : 1;

                    const statusAction =
                      toggleCategoryStatus.bind(
                        null,
                        category.id,
                        nextStatus,
                      );

                    return (
                      <tr key={category.id}>
                        <td>
                          <span className={styles.code}>
                            {category.category_code}
                          </span>
                        </td>

                        <td>
                          <div className={styles.categoryName}>
                            <strong>
                              {category.category_name}
                            </strong>
                            <span>
                              Created{" "}
                              {formatDate(category.created_at)}
                            </span>
                          </div>
                        </td>

                        <td>
                          <p className={styles.description}>
                            {category.description ||
                              "No description provided."}
                          </p>
                        </td>

                        <td>
                          <span className={styles.productCount}>
                            {category.product_count}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              category.is_active === 1
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }
                          >
                            {category.is_active === 1
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td>
                          {formatDate(category.updated_at)}
                        </td>

                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/categories/${category.id}`}
                              className={styles.editButton}
                            >
                              <Edit3 size={17} />
                              Edit
                            </Link>

                            <form action={statusAction}>
                              <button
                                type="submit"
                                className={
                                  category.is_active === 1
                                    ? styles.deactivateButton
                                    : styles.activateButton
                                }
                              >
                                {category.is_active === 1
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