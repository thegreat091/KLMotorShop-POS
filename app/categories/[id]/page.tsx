import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  CircleOff,
  Edit3,
  Save,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateCategory } from "../actions";
import styles from "../category-form.module.css";

interface CategoryRow extends RowDataPacket {
  id: number;
  category_code: string;
  category_name: string;
  description: string | null;
  is_active: number;
}

interface EditCategoryPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditCategoryPage({
  params,
  searchParams,
}: EditCategoryPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const categoryId = Number(routeParameters.id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    notFound();
  }

  const [categories] = await pool.execute<CategoryRow[]>(
    `
      SELECT
        id,
        category_code,
        category_name,
        description,
        is_active
      FROM product_categories
      WHERE id = ?
      LIMIT 1
    `,
    [categoryId],
  );

  const category = categories[0];

  if (!category) {
    notFound();
  }

  const updateAction = updateCategory.bind(null, category.id);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/categories" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Categories
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Edit3 size={27} />
          </div>

          <div>
            <p>{category.category_code}</p>
            <h1>Edit Category</h1>
            <span>
              Update the category information and availability.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {queryParameters.error ? (
          <div className={styles.errorMessage}>
            <CircleOff size={20} />
            {queryParameters.error}
          </div>
        ) : null}

        <form action={updateAction} className={styles.formCard}>
          <header>
            <div>
              <p>Category Information</p>
              <h2>{category.category_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {category.category_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Category Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="category_name"
                defaultValue={category.category_name}
                maxLength={120}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Description</span>

              <textarea
                name="description"
                rows={5}
                defaultValue={category.description ?? ""}
                placeholder="Describe the products included in this category."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(category.is_active)}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive categories remain in old records but cannot
                be used for new products.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/categories">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Changes
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}