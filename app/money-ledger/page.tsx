import type { RowDataPacket } from "mysql2";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./money-ledger.module.css";

interface LedgerRow extends RowDataPacket {
  id: number;
  entry_date: Date | string;
  entry_type: string;
  reference_table: string | null;
  reference_id: string | null;
  description: string;
  payment_method: string;
  account: string;
  amount_in: number;
  amount_out: number;
  processed_by_name: string | null;
  remarks: string | null;
  running_balance: number;
}

interface SummaryRow extends RowDataPacket {
  total_in: number;
  total_out: number;
  net: number;
}

interface FinancialSetupRow extends RowDataPacket {
  total: number;
}

interface MethodRow extends RowDataPacket {
  payment_method: string;
  total_in: number;
  total_out: number;
  net: number;
}

type Params = {
  from?: string;
  to?: string;
  type?: string;
  method?: string;
  q?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

function iso(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : fallback;
}

function dt(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function MoneyLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!["ADMIN", "OWNER", "CASHIER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ds = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const params = await searchParams;
  const from = iso(params.from, ds(first));
  const to = iso(params.to, ds(now));
  const type = (params.type ?? "").trim();
  const method = (params.method ?? "").trim();
  const q = (params.q ?? "").trim();
  const like = `%${q}%`;

  const args = [
    from,
    to,
    type,
    type,
    method,
    method,
    q,
    like,
    like,
  ];

  const [rows] = await pool.execute<LedgerRow[]>(
    `
      SELECT
        ml.id,
        ml.entry_date,
        ml.entry_type,
        ml.reference_table,
        ml.reference_id,
        ml.description,
        ml.payment_method,
        ml.account,
        ml.amount_in,
        ml.amount_out,
        u.full_name AS processed_by_name,
        ml.remarks,
        (
          SELECT COALESCE(SUM(x.amount_in - x.amount_out), 0)
          FROM money_ledger x
          WHERE
            x.entry_date < ml.entry_date
            OR (x.entry_date = ml.entry_date AND x.id <= ml.id)
        ) AS running_balance
      FROM money_ledger ml
      LEFT JOIN users u ON u.id = ml.processed_by
      WHERE
        DATE(ml.entry_date) >= ?
        AND DATE(ml.entry_date) <= ?
        AND (
          CAST(? AS CHAR CHARACTER SET utf8mb4) = ''
          OR CONVERT(ml.entry_type USING utf8mb4) COLLATE utf8mb4_unicode_ci
             = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        )
        AND (
          CAST(? AS CHAR CHARACTER SET utf8mb4) = ''
          OR CONVERT(ml.payment_method USING utf8mb4) COLLATE utf8mb4_unicode_ci
             = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        )
        AND (
          CAST(? AS CHAR CHARACTER SET utf8mb4) = ''
          OR CONVERT(ml.description USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
          OR CONVERT(COALESCE(ml.reference_id,'') USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        )
      ORDER BY ml.entry_date DESC, ml.id DESC
      LIMIT 1000
    `,
    args,
  );

  const [summaryRows] = await pool.execute<SummaryRow[]>(
    `
      SELECT
        COALESCE(SUM(amount_in),0) total_in,
        COALESCE(SUM(amount_out),0) total_out,
        COALESCE(SUM(amount_in-amount_out),0) net
      FROM money_ledger
      WHERE DATE(entry_date) >= ? AND DATE(entry_date) <= ?
    `,
    [from, to],
  );

  const [methods] = await pool.execute<MethodRow[]>(
    `
      SELECT
        payment_method,
        SUM(amount_in) total_in,
        SUM(amount_out) total_out,
        SUM(amount_in-amount_out) net
      FROM money_ledger
      WHERE DATE(entry_date) >= ? AND DATE(entry_date) <= ?
      GROUP BY payment_method
      ORDER BY payment_method
    `,
    [from, to],
  );

  const [financialSetupRows] = await pool.query<FinancialSetupRow[]>(
    "SELECT COUNT(*) AS total FROM financial_settings WHERE id = 1",
  );
  const financialInitialized = Number(financialSetupRows[0]?.total ?? 0) > 0;

  const summary = summaryRows[0] ?? {
    total_in: 0,
    total_out: 0,
    net: 0,
  };

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <Link href="/mechanic-payouts" className={styles.payoutLink}>
          <Banknote size={17} />
          Mechanic Payouts
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Finance</div>
          <h1>Money Ledger</h1>
          <p>
            Financial audit trail of money received from sales and money paid
            out for mechanic earnings.
          </p>
        </div>
        <WalletCards size={46} />
      </section>

      {!financialInitialized ? (
        <section className={styles.setupWarning}>
          <div>
            <strong>Financial Setup Required</strong>
            <span>
              The Money Ledger has not been initialized with an opening balance.
            </span>
          </div>
          {user.role === "OWNER" || user.role === "ADMIN" ? (
            <Link href="/financial-setup">Configure Opening Balance</Link>
          ) : null}
        </section>
      ) : null}

      <form className={styles.filters}>
        <label>
          From
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={type}>
            <option value="">All types</option>
            <option value="SALE">Sale</option>
            <option value="MECHANIC_PAYOUT">Mechanic Payout</option>
            <option value="REFUND">Refund / Reversal</option>
            <option value="OTHER_INCOME">Other Income</option>
            <option value="OTHER_EXPENSE">Other Expense</option>
          </select>
        </label>
        <label>
          Payment Method
          <select name="method" defaultValue={method}>
            <option value="">All methods</option>
            <option value="CASH">Cash</option>
            <option value="GCASH">GCash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className={styles.search}>
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Description / reference..."
          />
        </label>
        <button type="submit">Apply</button>
      </form>

      <section className={styles.metrics}>
        <article>
          <ArrowUpRight />
          <span>Money In</span>
          <strong>{money(summary.total_in)}</strong>
        </article>
        <article>
          <ArrowDownRight />
          <span>Money Out</span>
          <strong>{money(summary.total_out)}</strong>
        </article>
        <article>
          <CircleDollarSign />
          <span>Net Movement</span>
          <strong>{money(summary.net)}</strong>
        </article>
        <article>
          <WalletCards />
          <span>Ledger Entries</span>
          <strong>{rows.length}</strong>
        </article>
      </section>

      <section className={styles.methodGrid}>
        {methods.map((row) => (
          <article key={row.payment_method}>
            <span>{row.payment_method.replaceAll("_", " ")}</span>
            <strong>{money(row.net)}</strong>
            <small>
              In {money(row.total_in)} • Out {money(row.total_out)}
            </small>
          </article>
        ))}
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>Financial History</span>
            <h2>Money Movements</h2>
          </div>
          <strong>
            {from} → {to}
          </strong>
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Type</th>
                <th>Description</th>
                <th>Method</th>
                <th>Account</th>
                <th>Processed By</th>
                <th>Money In</th>
                <th>Money Out</th>
                <th>Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{dt(row.entry_date)}</td>
                  <td>
                    <span
                      className={
                        Number(row.amount_in) > 0
                          ? styles.inBadge
                          : styles.outBadge
                      }
                    >
                      {row.entry_type.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    <strong>{row.description}</strong>
                    {row.remarks ? <small>{row.remarks}</small> : null}
                  </td>
                  <td>{row.payment_method.replaceAll("_", " ")}</td>
                  <td><strong>{row.account}</strong></td>
                  <td>{row.processed_by_name ?? "—"}</td>
                  <td className={styles.amountIn}>
                    {Number(row.amount_in) > 0 ? money(row.amount_in) : "—"}
                  </td>
                  <td className={styles.amountOut}>
                    {Number(row.amount_out) > 0 ? money(row.amount_out) : "—"}
                  </td>
                  <td>
                    <strong>{money(row.running_balance)}</strong>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className={styles.empty}>
                    No money-ledger entries match the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
