import {
  ArrowLeft,
  Ban,
  Bike,
  Save,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createMotorcycleModel } from "../actions";
import styles from "../model-form.module.css";

interface NewMotorcycleModelPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewMotorcycleModelPage({
  searchParams,
}: NewMotorcycleModelPageProps) {
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
        <Link
          href="/motorcycle-models"
          className={styles.backButton}
        >
          <ArrowLeft size={19} />
          Back to Motorcycle Models
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Bike size={28} />
          </div>

          <div>
            <p>Motorcycle Master Data</p>
            <h1>Add Motorcycle Model</h1>
            <span>
              Add a model name for motorcycle registration and job
              orders.
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
          action={createMotorcycleModel}
          className={styles.formCard}
        >
          <header>
            <div>
              <p>Model Information</p>
              <h2>Enter the motorcycle model details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Model Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="model_name"
                placeholder="Example: R150"
                maxLength={120}
                autoFocus
                required
              />

              <small>
                The model code will be generated automatically as
                MODEL-000001.
              </small>
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                rows={5}
                placeholder="Optional notes about this motorcycle model."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select name="is_active" defaultValue="1">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Only active models can be selected when registering
                a motorcycle.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/motorcycle-models">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Motorcycle Model
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}