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
import { updateMechanic } from "../actions";
import styles from "../mechanic-form.module.css";

interface MechanicRow extends RowDataPacket {
  id: number;
  mechanic_code: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  date_hired: Date | string | null;
  default_owner_percentage: number;
  default_mechanic_percentage: number;
  is_active: number;
}

interface EditMechanicPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

function formatDateInput(
  value: Date | string | null,
): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export default async function EditMechanicPage({
  params,
  searchParams,
}: EditMechanicPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const mechanicId = Number(routeParameters.id);

  if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
    notFound();
  }

  const [mechanics] = await pool.execute<MechanicRow[]>(
    `
      SELECT
        id,
        mechanic_code,
        full_name,
        contact_number,
        email,
        address,
        date_hired,
        default_owner_percentage,
        default_mechanic_percentage,
        is_active
      FROM mechanics
      WHERE id = ?
      LIMIT 1
    `,
    [mechanicId],
  );

  const mechanic = mechanics[0];

  if (!mechanic) {
    notFound();
  }

  const updateAction = updateMechanic.bind(
    null,
    mechanic.id,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/mechanics" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Mechanics
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Edit3 size={28} />
          </div>

          <div>
            <p>{mechanic.mechanic_code}</p>
            <h1>Edit Mechanic</h1>
            <span>
              Update mechanic details and default commission
              percentages.
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
              <p>Mechanic Information</p>
              <h2>{mechanic.full_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {mechanic.mechanic_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Full Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="full_name"
                defaultValue={mechanic.full_name}
                maxLength={150}
                required
              />
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Contact Number</span>

                <input
                  type="text"
                  name="contact_number"
                  defaultValue={
                    mechanic.contact_number ?? ""
                  }
                  maxLength={50}
                />
              </label>

              <label className={styles.field}>
                <span>Email</span>

                <input
                  type="email"
                  name="email"
                  defaultValue={mechanic.email ?? ""}
                  maxLength={150}
                />
              </label>
            </div>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Date Hired</span>

                <input
                  type="date"
                  name="date_hired"
                  defaultValue={formatDateInput(
                    mechanic.date_hired,
                  )}
                />
              </label>

              <label className={styles.field}>
                <span>Status</span>

                <select
                  name="is_active"
                  defaultValue={String(mechanic.is_active)}
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Address</span>

              <textarea
                name="address"
                maxLength={255}
                defaultValue={mechanic.address ?? ""}
              />
            </label>

            <section className={styles.commissionBox}>
              <header>
                <h3>Default service allocation</h3>
                <p>
                  The percentages must always total exactly 100%.
                </p>
              </header>

              <div className={styles.twoColumns}>
                <label className={styles.field}>
                  <span>Owner Percentage</span>

                  <input
                    type="number"
                    name="default_owner_percentage"
                    defaultValue={Number(
                      mechanic.default_owner_percentage,
                    ).toFixed(2)}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>Mechanic Percentage</span>

                  <input
                    type="number"
                    name="default_mechanic_percentage"
                    defaultValue={Number(
                      mechanic.default_mechanic_percentage,
                    ).toFixed(2)}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </label>
              </div>
            </section>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/mechanics">Cancel</Link>

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