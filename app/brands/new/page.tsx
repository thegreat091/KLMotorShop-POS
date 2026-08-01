import {
  ArrowLeft,
  Ban,
  Plus,
  Save,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createBrand } from "../actions";
import styles from "../brand-form.module.css";

interface NewBrandPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewBrandPage({
  searchParams,
}: NewBrandPageProps) {
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
      <header className={styles.hero}>
        <Link href="/brands" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Brands
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Plus size={28} />
          </div>

          <div>
            <p>Product Brands</p>
            <h1>Add New Brand</h1>
            <span>
              Register a manufacturer or product brand in the
              inventory system.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {parameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={20} />
            {parameters.error}
          </div>
        ) : null}

        <form action={createBrand} className={styles.formCard}>
          <header>
            <div>
              <p>Brand Information</p>
              <h2>Enter the brand details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Brand Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="brand_name"
                placeholder="Example: NGK"
                maxLength={120}
                autoFocus
                required
              />

              <small>
                The brand code will be generated automatically.
              </small>
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Country of Origin</span>

                <input
                  type="text"
                  name="country_of_origin"
                  placeholder="Example: Japan"
                  maxLength={100}
                />
              </label>

              <label className={styles.field}>
                <span>Website</span>

                <input
                  type="text"
                  name="website"
                  placeholder="Example: https://www.example.com"
                  maxLength={255}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Description</span>

              <textarea
                name="description"
                rows={5}
                placeholder="Describe the products supplied under this brand."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select name="is_active" defaultValue="1">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive brands cannot be selected for new products.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/brands">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Brand
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}