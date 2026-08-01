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
import { updateClient } from "../actions";
import styles from "../client-form.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
  mobile_number: string | null;
  remarks: string | null;
  is_active: number;
}

interface EditClientPageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditClientPage({
  params,
  searchParams,
}: EditClientPageProps) {
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

  const clientId = Number(routeParameters.id);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    notFound();
  }

  const [clients] = await pool.execute<ClientRow[]>(
    `
      SELECT
        id,
        client_code,
        client_name,
        mobile_number,
        remarks,
        is_active
      FROM clients
      WHERE id = ?
      LIMIT 1
    `,
    [clientId],
  );

  const client = clients[0];

  if (!client) {
    notFound();
  }

  const updateAction = updateClient.bind(
    null,
    client.id,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/clients" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Clients
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Edit3 size={28} />
          </div>

          <div>
            <p>{client.client_code}</p>
            <h1>Edit Client</h1>
            <span>
              Update the client name, mobile number, remarks, and
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

        <form action={updateAction} className={styles.formCard}>
          <header>
            <div>
              <p>Client Information</p>
              <h2>{client.client_name}</h2>
            </div>

            <span className={styles.codeBadge}>
              {client.client_code}
            </span>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Client Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="client_name"
                defaultValue={client.client_name}
                maxLength={150}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Mobile Number</span>

              <input
                type="text"
                name="mobile_number"
                defaultValue={client.mobile_number ?? ""}
                maxLength={50}
                placeholder="Example: 09123456789"
              />
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                rows={5}
                defaultValue={client.remarks ?? ""}
                placeholder="Optional notes about this client."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select
                name="is_active"
                defaultValue={String(client.is_active)}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Inactive clients remain in previous sales and job
                orders but cannot be selected for new transactions.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/clients">Cancel</Link>

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