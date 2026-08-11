import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { initializeOpeningBalanceAction } from "./actions";
import styles from "./financial-setup.module.css";

interface FinancialRow extends RowDataPacket {
  opening_balance: number;
  remarks: string | null;
  initialized_at: Date | string;
  initialized_by_name: string | null;
}

type Params = {
  error?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

export default async function FinancialSetupPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["OWNER", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  const [rows] = await pool.query<FinancialRow[]>(
    `
      SELECT
        fs.opening_balance,
        fs.remarks,
        fs.initialized_at,
        u.full_name AS initialized_by_name
      FROM financial_settings fs
      LEFT JOIN users u ON u.id = fs.initialized_by
      WHERE fs.id = 1
      LIMIT 1
    `,
  );

  const initialized = rows[0] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Finance Setup</div>
          <h1>Opening Balance</h1>
          <p>
            Initialize the business Money Ledger with the amount available when
            KL Motor Shop begins using this system.
          </p>
        </div>
        <CircleDollarSign size={48} />
      </section>

      {params.error ? (
        <div className={styles.error}>{params.error}</div>
      ) : null}

      {initialized ? (
        <section className={styles.completeCard}>
          <div className={styles.completeIcon}>
            <CheckCircle2 size={28} />
          </div>

          <div>
            <div className={styles.eyebrow}>Financial Setup Complete</div>
            <h2>{money(initialized.opening_balance)}</h2>
            <p>
              Initialized by {initialized.initialized_by_name ?? "Owner"} on{" "}
              {new Date(initialized.initialized_at).toLocaleString("en-PH")}.
            </p>
            {initialized.remarks ? <small>{initialized.remarks}</small> : null}
          </div>

          <div className={styles.locked}>
            <LockKeyhole size={18} />
            Opening balance is locked.
          </div>
        </section>
      ) : (
        <section className={styles.setupCard}>
          <header>
            <span className={styles.icon}>
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2>Initial Financial Setup</h2>
              <p>This action can be completed only once by the Owner.</p>
            </div>
          </header>

          {user.role === "OWNER" ? (
            <form action={initializeOpeningBalanceAction}>
              <label>
                Business Opening Balance
                <div className={styles.moneyInput}>
                  <span>₱</span>
                  <input
                    type="number"
                    name="opening_balance"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    placeholder="0.00"
                  />
                </div>
                <small>
                  Enter the business money you want the Money Ledger to start
                  from on deployment day.
                </small>
              </label>

              <label>
                Remarks
                <textarea
                  name="remarks"
                  rows={3}
                  defaultValue="Initial business opening balance upon system deployment."
                />
              </label>

              <div className={styles.warning}>
                This value becomes the first Money Ledger transaction and
                cannot be edited afterward. Corrections should be recorded as a
                separate finance adjustment later.
              </div>

              <button type="submit">Save Opening Balance</button>
            </form>
          ) : (
            <div className={styles.ownerOnly}>
              The financial setup has not been initialized yet. Only an Owner
              account can enter the opening balance.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
