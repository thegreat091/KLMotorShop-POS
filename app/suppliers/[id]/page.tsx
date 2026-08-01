import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Ban,
  Edit3,
  Save,
} from "lucide-react";
import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateSupplier } from "../actions";
import styles from "../supplier-form.module.css";

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
}

interface EditSupplierPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditSupplierPage({
  params,
  searchParams,
}: EditSupplierPageProps) {
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

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const supplierId = Number(routeParameters.id);

  if (
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    notFound();
  }

  const [suppliers] =
    await pool.execute<SupplierRow[]>(
      `
        SELECT
          id,
          supplier_code,
          supplier_name,
          contact_person,
          mobile_number,
          telephone_number,
          address,
          remarks,
          is_active
        FROM suppliers
        WHERE id = ?
        LIMIT 1
      `,
      [supplierId],
    );

  const supplier = suppliers[0];

  if (!supplier) {
    notFound();
  }

  const updateAction = updateSupplier.bind(
    null,
    supplier.id,
  );

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
            <Edit3 size={28} />
          </div>

          <div>
            <p>{supplier.supplier_code}</p>
            <h1>Edit Supplier</h1>
            <span>
              Update supplier contact information,
              remarks, and status.
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

        <form
          action={updateAction}
          className={styles.formCard}
        >
          <header>
            <div>
              <p>Supplier Information</p>
              <h2>{supplier.supplier_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {supplier.supplier_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Supplier Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="supplier_name"
                defaultValue={
                  supplier.supplier_name
                }
                maxLength={150}
                required
              />
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Contact Person</span>

                <input
                  type="text"
                  name="contact_person"
                  defaultValue={
                    supplier.contact_person ?? ""
                  }
                  maxLength={150}
                />
              </label>

              <label className={styles.field}>
                <span>Mobile Number</span>

                <input
                  type="text"
                  name="mobile_number"
                  defaultValue={
                    supplier.mobile_number ?? ""
                  }
                  maxLength={50}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Telephone Number</span>

              <input
                type="text"
                name="telephone_number"
                defaultValue={
                  supplier.telephone_number ?? ""
                }
                maxLength={50}
              />
            </label>

            <label className={styles.field}>
              <span>Address</span>

              <textarea
                name="address"
                defaultValue={supplier.address ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                defaultValue={supplier.remarks ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(
                  supplier.is_active,
                )}
              >
                <option value="1">
                  Active
                </option>
                <option value="0">
                  Inactive
                </option>
              </select>

              <small>
                Inactive suppliers remain in old records
                but cannot be used for new purchases.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/suppliers">
              Cancel
            </Link>

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