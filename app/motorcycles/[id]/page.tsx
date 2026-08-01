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
import { updateMotorcycle } from "../actions";
import styles from "../motorcycle-form.module.css";

interface MotorcycleRow extends RowDataPacket {
  id: number;
  motorcycle_code: string;
  client_id: number;
  model_id: number;
  plate_number: string;
  remarks: string | null;
  is_active: number;
}

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
  is_active: number;
}

interface ModelRow extends RowDataPacket {
  id: number;
  model_code: string;
  model_name: string;
  is_active: number;
}

interface EditMotorcyclePageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditMotorcyclePage({
  params,
  searchParams,
}: EditMotorcyclePageProps) {
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

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const motorcycleId = Number(routeParameters.id);

  if (
    !Number.isInteger(motorcycleId) ||
    motorcycleId <= 0
  ) {
    notFound();
  }

  const [motorcycles] =
    await pool.execute<MotorcycleRow[]>(
      `
        SELECT
          id,
          motorcycle_code,
          client_id,
          model_id,
          plate_number,
          remarks,
          is_active
        FROM motorcycles
        WHERE id = ?
        LIMIT 1
      `,
      [motorcycleId],
    );

  const motorcycle = motorcycles[0];

  if (!motorcycle) {
    notFound();
  }

  const [clients] = await pool.query<ClientRow[]>(
    `
      SELECT
        id,
        client_code,
        client_name,
        is_active
      FROM clients
      WHERE is_active = 1
         OR id = ?
      ORDER BY client_name ASC
    `,
    [motorcycle.client_id],
  );

  const [models] = await pool.query<ModelRow[]>(
    `
      SELECT
        id,
        model_code,
        model_name,
        is_active
      FROM motorcycle_models
      WHERE is_active = 1
         OR id = ?
      ORDER BY model_name ASC
    `,
    [motorcycle.model_id],
  );

  const updateAction = updateMotorcycle.bind(
    null,
    motorcycle.id,
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
            <Edit3 size={28} />
          </div>

          <div>
            <p>{motorcycle.motorcycle_code}</p>
            <h1>Edit Motorcycle</h1>
            <span>
              Update the client, plate number, model, remarks, and
              status.
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
              <p>Motorcycle Information</p>
              <h2>{motorcycle.plate_number}</h2>
            </div>

            <span className={styles.codeBadge}>
              {motorcycle.motorcycle_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Client <strong>*</strong>
              </span>

              <select
                name="client_id"
                defaultValue={String(
                  motorcycle.client_id,
                )}
                required
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_name} — {client.client_code}
                    {client.is_active === 1
                      ? ""
                      : " (Inactive)"}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.twoColumns}>
              <label className={styles.field}>
                <span>
                  Plate Number <strong>*</strong>
                </span>

                <input
                  type="text"
                  name="plate_number"
                  defaultValue={motorcycle.plate_number}
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
                  defaultValue={String(
                    motorcycle.model_id,
                  )}
                  required
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.model_name}
                      {model.is_active === 1
                        ? ""
                        : " (Inactive)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                defaultValue={motorcycle.remarks ?? ""}
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(
                  motorcycle.is_active,
                )}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/motorcycles">Cancel</Link>

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