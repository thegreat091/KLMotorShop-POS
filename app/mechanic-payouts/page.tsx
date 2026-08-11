import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  History,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { payMechanicAction } from "./actions";
import styles from "./mechanic-payouts.module.css";

interface MechanicRow extends RowDataPacket {
  id: number;
  full_name: string;
  unpaid_count: number;
  unpaid_amount: number;
}

interface EarningRow extends RowDataPacket {
  id: number;
  earning_date: Date | string;
  job_order_number: string | null;
  service_name: string | null;
  service_amount: number;
  mechanic_percentage: number;
  mechanic_share: number;
}

interface PayoutRow extends RowDataPacket {
  id: number;
  payout_number: string;
  full_name: string;
  total_amount: number;
  payment_method: string;
  paid_at: Date | string;
  cashier_name: string | null;
}

interface AdvanceSummaryRow extends RowDataPacket {
  advance_amount: number;
  advance_count: number;
}

interface SummaryRow extends RowDataPacket {
  unpaid_amount: number;
  unpaid_count: number;
}

type Params = {
  mechanic?: string;
  success?: string;
  error?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

function dt(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function MechanicPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!["ADMIN", "OWNER", "CASHIER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const mechanicId = Number(params.mechanic || 0);

  const [mechanics] = await pool.query<MechanicRow[]>(
    `
      SELECT
        m.id,
        m.full_name,
        COUNT(me.id) AS unpaid_count,
        COALESCE(SUM(me.mechanic_share), 0) AS unpaid_amount
      FROM mechanics m
      INNER JOIN mechanic_earnings me
        ON me.mechanic_id = m.id
       AND me.payout_status = 'UNPAID'
       AND me.payout_id IS NULL
      WHERE m.is_active = 1
      GROUP BY m.id, m.full_name
      HAVING COUNT(me.id) > 0
      ORDER BY m.full_name
    `,
  );

  let earnings: EarningRow[] = [];
  let summary = { unpaid_amount: 0, unpaid_count: 0 };

  if (Number.isInteger(mechanicId) && mechanicId > 0) {
    const [earningRows] = await pool.execute<EarningRow[]>(
      `
        SELECT
          me.id,
          me.earning_date,
          jo.job_order_number,
          s.service_name,
          me.service_amount,
          me.mechanic_percentage,
          me.mechanic_share
        FROM mechanic_earnings me
        LEFT JOIN job_orders jo ON jo.id = me.job_order_id
        LEFT JOIN services s ON s.id = me.service_id
        WHERE
          me.mechanic_id = ?
          AND me.payout_status = 'UNPAID'
          AND me.payout_id IS NULL
        ORDER BY me.earning_date ASC, me.id ASC
      `,
      [mechanicId],
    );

    earnings = earningRows;

    summary = {
      unpaid_amount: earnings.reduce(
        (sum, row) => sum + Number(row.mechanic_share),
        0,
      ),
      unpaid_count: earnings.length,
    };
  }

  const [history] = await pool.query<PayoutRow[]>(
    `
      SELECT
        mp.id,
        mp.payout_number,
        m.full_name,
        mp.total_amount,
        mp.payment_method,
        mp.paid_at,
        u.full_name AS cashier_name
      FROM mechanic_payouts mp
      JOIN mechanics m ON m.id = mp.mechanic_id
      LEFT JOIN users u ON u.id = mp.processed_by
      ORDER BY mp.paid_at DESC, mp.id DESC
      LIMIT 100
    `,
  );

  let advanceAmount = 0;
  let advanceCount = 0;

  if (Number.isInteger(mechanicId) && mechanicId > 0) {
    const [advanceRows] = await pool.execute<AdvanceSummaryRow[]>(
      `
        SELECT
          COALESCE(SUM(amount),0) AS advance_amount,
          COUNT(*) AS advance_count
        FROM mechanic_cash_advances
        WHERE mechanic_id = ? AND status = 'OPEN'
      `,
      [mechanicId],
    );

    advanceAmount = Number(advanceRows[0]?.advance_amount ?? 0);
    advanceCount = Number(advanceRows[0]?.advance_count ?? 0);
  }

  const selectedMechanic = mechanics.find((row) => row.id === mechanicId);
  const canPay = ["ADMIN", "CASHIER"].includes(user.role);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <Link href="/money-ledger" className={styles.ledgerLink}>
          <CircleDollarSign size={17} />
          Money Ledger
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Finance</div>
          <h1>Mechanic Payouts</h1>
          <p>
            Cashier payment of completed mechanic earnings with a permanent
            payout and money-ledger record.
          </p>
        </div>
        <Banknote size={46} />
      </section>

      {params.error ? <div className={styles.error}>{params.error}</div> : null}
      {params.success ? (
        <div className={styles.success}>{params.success}</div>
      ) : null}

      <section className={styles.metrics}>
        <article>
          <UserRound />
          <span>Selected Mechanic</span>
          <strong>{selectedMechanic?.full_name ?? "None"}</strong>
        </article>
        <article>
          <Clock3 />
          <span>Unpaid Earnings</span>
          <strong>{summary.unpaid_count}</strong>
        </article>
        <article>
          <CircleDollarSign />
          <span>Outstanding Amount</span>
          <strong>{money(summary.unpaid_amount)}</strong>
        </article>
        <article>
          <History />
          <span>Payout Records</span>
          <strong>{history.length}</strong>
        </article>
        <article>
          <Banknote />
          <span>Open Cash Advance</span>
          <strong>{money(advanceAmount)}</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>Select Mechanic</span>
            <h2>Unpaid Mechanic Earnings</h2>
          </div>
        </header>

        <form method="get" className={styles.mechanicFilter}>
          <select name="mechanic" defaultValue={mechanicId || ""}>
            <option value="">Select mechanic...</option>
            {mechanics.map((mechanic) => (
              <option key={mechanic.id} value={mechanic.id}>
                {mechanic.full_name} — {money(mechanic.unpaid_amount)} unpaid
              </option>
            ))}
          </select>
          <button type="submit">View Earnings</button>
          <small className={styles.filterHint}>
            Only mechanics with unpaid earnings are shown.
          </small>
        </form>

        {selectedMechanic ? (
          earnings.length ? (
            <form action={payMechanicAction}>
              <input type="hidden" name="mechanic_id" value={mechanicId} />

              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Pay</th>
                      <th>Date Earned</th>
                      <th>Job Order</th>
                      <th>Service</th>
                      <th>Service Amount</th>
                      <th>Share %</th>
                      <th>Mechanic Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((earning) => (
                      <tr key={earning.id}>
                        <td>
                          <input
                            type="checkbox"
                            name="earning_id"
                            value={earning.id}
                            defaultChecked
                          />
                        </td>
                        <td>{dt(earning.earning_date)}</td>
                        <td>{earning.job_order_number ?? "—"}</td>
                        <td>{earning.service_name ?? "—"}</td>
                        <td>{money(earning.service_amount)}</td>
                        <td>{Number(earning.mechanic_percentage).toFixed(2)}%</td>
                        <td>
                          <strong>{money(earning.mechanic_share)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.payoutBox}>
                <div>
                  <span>Selected Earnings Before Advance</span>
                  <strong>{money(summary.unpaid_amount)}</strong>
                  {advanceAmount > 0 ? <small>Open cash advance: {money(advanceAmount)} will be deducted automatically.</small> : null}
                  <small>
                    Uncheck individual rows if you are paying only selected
                    earnings.
                  </small>
                </div>

                <label>
                  Payment Method
                  <select name="payment_method" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label>
                  Remarks
                  <input
                    name="remarks"
                    placeholder="Optional payout notes..."
                  />
                </label>

                {canPay ? (
                  <button type="submit">
                    <CheckCircle2 size={17} />
                    Pay Selected Earnings
                  </button>
                ) : (
                  <div className={styles.readOnly}>
                    Owner view only — Cashier processes payouts.
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div className={styles.empty}>
              This mechanic has no unpaid earnings.
            </div>
          )
        ) : (
          <div className={styles.empty}>
            {mechanics.length
              ? "Select a mechanic to view unpaid earnings."
              : "No mechanics currently have unpaid earnings."}
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>History</span>
            <h2>Mechanic Payout History</h2>
          </div>
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payout</th>
                <th>Mechanic</th>
                <th>Method</th>
                <th>Processed By</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{dt(row.paid_at)}</td>
                  <td>
                    <strong>{row.payout_number}</strong>
                  </td>
                  <td>{row.full_name}</td>
                  <td>{row.payment_method.replaceAll("_", " ")}</td>
                  <td>{row.cashier_name ?? "—"}</td>
                  <td>
                    <strong>{money(row.total_amount)}</strong>
                  </td>
                  <td>
                    <Link href={`/mechanic-payouts/${row.id}/print`}>
                      Print
                    </Link>
                  </td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    No mechanic payouts yet.
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
