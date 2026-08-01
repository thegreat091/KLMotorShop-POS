import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Ban,
  Edit3,
  Save,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateBrand } from "../actions";
import styles from "../brand-form.module.css";

interface BrandRow extends RowDataPacket {
  id: number;
  brand_code: string;
  brand_name: string;
  description: string | null;
  country_of_origin: string | null;
  website: string | null;
  is_active: number;
}

interface EditBrandPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditBrandPage({
  params,
  searchParams,
}: EditBrandPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "INVENTORY") {
    redirect("/dashboard");
  }

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const brandId = Number(routeParameters.id);

  if (!Number.isInteger(brandId) || brandId <= 0) {
    notFound();
  }

  const [brands] = await pool.execute<BrandRow[]>(
    `
      SELECT
        id,
        brand_code,
        brand_name,
        description,
        country_of_origin,
        website,
        is_active
      FROM product_brands
      WHERE id = ?
      LIMIT 1
    `,
    [brandId],
  );

  const brand = brands[0];

  if (!brand) {
    notFound();
  }

  const updateAction = updateBrand.bind(null, brand.id);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/brands" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Brands
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Edit3 size={27} />
          </div>

          <div>
            <p>{brand.brand_code}</p>
            <h1>Edit Brand</h1>
            <span>
              Update the brand information and availability.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {queryParameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={20} />
            {queryParameters.error}
          </div>
        ) : null}

        <form action={updateAction} className={styles.formCard}>
          <header>
            <div>
              <p>Brand Information</p>
              <h2>{brand.brand_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {brand.brand_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Brand Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="brand_name"
                defaultValue={brand.brand_name}
                maxLength={120}
                required
              />
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Country of Origin</span>

                <input
                  type="text"
                  name="country_of_origin"
                  defaultValue={brand.country_of_origin ?? ""}
                  maxLength={100}
                  placeholder="Example: Japan"
                />
              </label>

              <label className={styles.field}>
                <span>Website</span>

                <input
                  type="text"
                  name="website"
                  defaultValue={brand.website ?? ""}
                  maxLength={255}
                  placeholder="Example: https://www.example.com"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Description</span>

              <textarea
                name="description"
                rows={5}
                defaultValue={brand.description ?? ""}
                placeholder="Describe the products supplied under this brand."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(brand.is_active)}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive brands remain in previous records but
                cannot be used for new products.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/brands">Cancel</Link>

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