import {
  ArrowLeft,
  Ban,
  Save,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "../actions";
import styles from "../client-form.module.css";

interface NewClientPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewClientPage({
  searchParams,
}: NewClientPageProps) {
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

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/clients" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Clients
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <UserPlus size={28} />
          </div>

          <div>
            <p>Customer Management</p>
            <h1>Add Client</h1>
            <span>
              Register a client for retail sales and motorcycle job
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

        <form action={createClient} className={styles.formCard}>
          <header>
            <div>
              <p>Client Information</p>
              <h2>Enter the client details</h2>
            </div>
          </header>

          <div className={styles.formBody}>
            <label className={styles.field}>
              <span>
                Client Name <strong>*</strong>
              </span>

              <input
                type="text"
                name="client_name"
                placeholder="Example: Juan Dela Cruz"
                maxLength={150}
                autoFocus
                required
              />

              <small>
                The client code will be generated automatically as
                CLIENT-000001.
              </small>
            </label>

            <label className={styles.field}>
              <span>Mobile Number</span>

              <input
                type="text"
                name="mobile_number"
                placeholder="Example: 09123456789"
                maxLength={50}
              />

              <small>
                Optional, but useful when searching for returning
                clients.
              </small>
            </label>

            <label className={styles.field}>
              <span>Remarks</span>

              <textarea
                name="remarks"
                rows={5}
                placeholder="Optional notes about this client."
              />
            </label>

            <label className={styles.field}>
              <span>Status</span>

              <select name="is_active" defaultValue="1">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>

              <small>
                Only active clients can be selected for new job
                orders.
              </small>
            </label>
          </div>

          <footer className={styles.formFooter}>
            <Link href="/clients">Cancel</Link>

            <button type="submit">
              <Save size={19} />
              Save Client
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}