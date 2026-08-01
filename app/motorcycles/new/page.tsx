import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Ban,
  Bike,
  Save,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createMotorcycle } from "../actions";
import styles from "../motorcycle-form.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
}

interface ModelRow extends RowDataPacket {
  id: number;
  model_code: string;
  model_name: string;
}

interface NewMotorcyclePageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewMotorcyclePage({
  searchParams,
}: NewMotorcyclePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (
    user.role !== "ADMIN" &&
    user.role !== "OWNER" &&
    user.role !== "CASHIER"
  ) {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  const [clients] = await pool.query<ClientRow[]>(
    `
      SELECT
        id,
        client_code,
        client_name
      FROM clients
      WHERE is_active = 1
      ORDER BY client_name ASC
    `,
  );

  const [models] = await pool.query<ModelRow[]>(
    `
      SELECT
        id,
        model_code,
        model_name
      FROM motorcycle_models
      WHERE is_active = 1
      ORDER BY model_name ASC
    `,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link
          href="/motorcycles"
          className={styles.backButton}
        >
          <ArrowLeft size={19} />
          Back to Motorcycles
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Bike size={28} />
          </div>

          <div>
            <p>Customer Management</p>
            <h1>Add Motorcycle</h1>
            <span>
              Register the client, plate number, and motorcycle
              model.
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
          action={createMotorcycle}
          className={styles.formCard}
        >
          <header>
            <div>
              <p>Motorcycle Information</p>
              <h2>Enter the motorcycle details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Client <strong>*</strong>
              </span>

              <select name="client_id" defaultValue="" required>
                <option value="" disabled>
                  Select client
                </option>

                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_name} — {client.client_code}
                  </option>
                ))}
              </select>

              <small>
                Add the client first if the name is not listed.
              </small>
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>
                  Plate Number <strong>*</strong>
                </span>

                <input
                  type="text"
                  name="plate_number"
                  placeholder="Example: ABC 1234"
                  maxLength={50}
                  required
                />
              </label>

              <label className={styles.field}>
                <span>
                  Motorcycle Model <strong>*</strong>
                </span>

                <select
                  name="model_id"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Select motorcycle model
                  </option>

                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.model_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                placeholder="Optional notes about the motorcycle."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select name="is_active" defaultValue="1">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Only active motorcycles can be selected for new job
                orders.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/motorcycles">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Motorcycle
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}