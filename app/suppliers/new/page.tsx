import {
  ArrowLeft,
  Ban,
  Building2,
  Save,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupplier } from "../actions";
import styles from "../supplier-form.module.css";

interface NewSupplierPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewSupplierPage({
  searchParams,
}: NewSupplierPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (
    user.role !== "ADMIN" &&
    user.role !== "INVENTORY"
  ) {
    redirect("/suppliers");
  }

  const parameters = await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link
          href="/suppliers"
          className={styles.backButton}
        >
          <ArrowLeft size={19} />
          Back to Suppliers
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Building2 size={28} />
          </div>

          <div>
            <p>Inventory Master Data</p>
            <h1>Add Supplier</h1>
            <span>
              Register a supplier for products,
              purchases, and stock receiving.
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

        <form
          action={createSupplier}
          className={styles.formCard}
        >
          <header>
            <div>
              <p>Supplier Information</p>
              <h2>Enter the supplier details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Supplier Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="supplier_name"
                placeholder="Example: Motul Philippines"
                maxLength={150}
                autoFocus
                required
              />

              <small>
                The supplier code will be generated
                automatically as SUP-000001.
              </small>
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Contact Person</span>

                <input
                  type="text"
                  name="contact_person"
                  placeholder="Example: Juan Dela Cruz"
                  maxLength={150}
                />
              </label>

              <label className={styles.field}>
                <span>Mobile Number</span>

                <input
                  type="text"
                  name="mobile_number"
                  placeholder="Example: 09123456789"
                  maxLength={50}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Telephone Number</span>

              <input
                type="text"
                name="telephone_number"
                placeholder="Example: (064) 123-4567"
                maxLength={50}
              />
            </label>

            <label className={styles.field}>
              <span>Address</span>

              <textarea
                name="address"
                placeholder="Enter the supplier address."
              />
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                placeholder="Optional notes about this supplier."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue="1"
              >
                <option value="1">
                  Active
                </option>
                <option value="0">
                  Inactive
                </option>
              </select>

              <small>
                Only active suppliers can be selected
                for new products and purchases.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/suppliers">
              Cancel
            </Link>

            <button type="submit">
              <Save size={19} />
              Save Supplier
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}