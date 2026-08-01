import {
  ArrowLeft,
  CircleOff,
  FolderPlus,
  Save,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createCategory } from "../actions";
import styles from "../category-form.module.css";

interface NewCategoryPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewCategoryPage({
  searchParams,
}: NewCategoryPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/categories" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Categories
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <FolderPlus size={27} />
          </div>

          <div>
            <p>Product Categories</p>
            <h1>Add New Category</h1>
            <span>
              Create a category for organizing products and
              inventory.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {parameters.error ? (
          <div className={styles.errorMessage}>
            <CircleOff size={20} />
            {parameters.error}
          </div>
        ) : null}

        <form action={createCategory} className={styles.formCard}>
          <header>
            <div>
              <p>Category Information</p>
              <h2>Enter the category details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Category Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="category_name"
                placeholder="Example: Engine Parts"
                maxLength={120}
                autoFocus
                required
              />

              <small>
                The category code will be generated automatically.
              </small>
            </label>

            <label className={styles.field}>
              <span>Description</span>

              <textarea
                name="description"
                rows={5}
                placeholder="Describe the products included in this category."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select name="is_active" defaultValue="1">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive categories cannot be selected for new
                products.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/categories">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Category
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}