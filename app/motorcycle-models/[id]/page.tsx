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
import { updateMotorcycleModel } from "../actions";
import styles from "../model-form.module.css";

interface MotorcycleModelRow extends RowDataPacket {
  id: number;
  model_code: string;
  model_name: string;
  remarks: string | null;
  is_active: number;
}

interface EditMotorcycleModelPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditMotorcycleModelPage({
  params,
  searchParams,
}: EditMotorcycleModelPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const modelId = Number(routeParameters.id);

  if (!Number.isInteger(modelId) || modelId <= 0) {
    notFound();
  }

  const [models] =
    await pool.execute<MotorcycleModelRow[]>(
      `
        SELECT
          id,
          model_code,
          model_name,
          remarks,
          is_active
        FROM motorcycle_models
        WHERE id = ?
        LIMIT 1
      `,
      [modelId],
    );

  const model = models[0];

  if (!model) {
    notFound();
  }

  const updateAction = updateMotorcycleModel.bind(
    null,
    model.id,
  );

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
            <Edit3 size={28} />
          </div>

          <div>
            <p>{model.model_code}</p>
            <h1>Edit Motorcycle Model</h1>
            <span>
              Update the model name, remarks, and availability.
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
              <p>Model Information</p>
              <h2>{model.model_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {model.model_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Model Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="model_name"
                defaultValue={model.model_name}
                maxLength={120}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                rows={5}
                defaultValue={model.remarks ?? ""}
                placeholder="Optional notes about this motorcycle model."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(model.is_active)}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive models remain in old records but cannot be
                selected for new motorcycle registrations.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/motorcycle-models">Cancel</Link>

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