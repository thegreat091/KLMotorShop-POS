import {
  ArrowLeft,
  Ban,
  Save,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createMechanic } from "../actions";
import styles from "../mechanic-form.module.css";

interface NewMechanicPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewMechanicPage({
  searchParams,
}: NewMechanicPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/mechanics" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Mechanics
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <UserPlus size={28} />
          </div>

          <div>
            <p>Service Management</p>
            <h1>Add Mechanic</h1>
            <span>
              Register a mechanic and configure the default
              service-sharing percentage.
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

        <form action={createMechanic} className={styles.formCard}>
          <header>
            <div>
              <p>Mechanic Information</p>
              <h2>Enter mechanic details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Full Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="full_name"
                maxLength={150}
                placeholder="Example: Juan Dela Cruz"
                autoFocus
                required
              />

              <small>
                The mechanic code will be generated automatically.
              </small>
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Contact Number</span>

                <input
                  type="text"
                  name="contact_number"
                  maxLength={50}
                  placeholder="Example: 09123456789"
                />
              </label>

              <label className={styles.field}>
                <span>Email</span>

                <input
                  type="email"
                  name="email"
                  maxLength={150}
                  placeholder="mechanic@example.com"
                />
              </label>
            </div>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>Date Hired</span>

                <input type="date" name="date_hired" />
              </label>

              <label className={styles.field}>
                <span>Status</span>

                <select name="is_active" defaultValue="1">
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
                placeholder="Enter the mechanic's address."
              />
            </label>

            <section className={styles.commissionBox}>
              <header>
                <h3>Default service allocation</h3>
                <p>
                  These percentages will be used as defaults when
                  assigning services to this mechanic.
                </p>
              </header>

              <div className={styles.twoColumns}>
                <label className={styles.field}>
                  <span>Owner Percentage</span>

                  <input
                    type="number"
                    name="default_owner_percentage"
                    defaultValue="20.00"
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
                    defaultValue="80.00"
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
              Save Mechanic
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}