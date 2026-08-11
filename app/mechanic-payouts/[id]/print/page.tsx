import type { RowDataPacket } from "mysql2";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./print.module.css";

interface PayoutRow extends RowDataPacket {
  id: number;
  payout_number: string;
  total_amount: number;
  payment_method: string;
  remarks: string | null;
  paid_at: Date | string;
  mechanic_name: string;
  cashier_name: string | null;
}

interface ItemRow extends RowDataPacket {
  id: number;
  earning_date: Date | string;
  job_order_number: string | null;
  service_name: string | null;
  service_amount: number;
  mechanic_percentage: number;
  mechanic_share: number;
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

export default async function MechanicPayoutPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!["ADMIN", "OWNER", "CASHIER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [payoutRows] = await pool.execute<PayoutRow[]>(
    `
      SELECT
        mp.id,
        mp.payout_number,
        mp.total_amount,
        mp.payment_method,
        mp.remarks,
        mp.paid_at,
        m.full_name AS mechanic_name,
        u.full_name AS cashier_name
      FROM mechanic_payouts mp
      JOIN mechanics m ON m.id = mp.mechanic_id
      LEFT JOIN users u ON u.id = mp.processed_by
      WHERE mp.id = ?
      LIMIT 1
    `,
    [id],
  );

  const payout = payoutRows[0];
  if (!payout) notFound();

  const [items] = await pool.execute<ItemRow[]>(
    `
      SELECT
        me.id,
        me.earning_date,
        jo.job_order_number,
        s.service_name,
        me.service_amount,
        me.mechanic_percentage,
        me.mechanic_share
      FROM mechanic_payout_items mpi
      JOIN mechanic_earnings me ON me.id = mpi.mechanic_earning_id
      LEFT JOIN job_orders jo ON jo.id = me.job_order_id
      LEFT JOIN services s ON s.id = me.service_id
      WHERE mpi.payout_id = ?
      ORDER BY me.earning_date, me.id
    `,
    [id],
  );

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <a href="/mechanic-payouts">← Mechanic Payouts</a>
        <PrintButton />
      </div>

      <section className={styles.document}>
        <header>
          <div>
            <strong>KL MOTOR SHOP</strong>
            <span>Mechanic Payout Slip</span>
          </div>
          <div>
            <small>Payout No.</small>
            <strong>{payout.payout_number}</strong>
          </div>
        </header>

        <section className={styles.info}>
          <div>
            <span>Mechanic</span>
            <strong>{payout.mechanic_name}</strong>
          </div>
          <div>
            <span>Date Paid</span>
            <strong>{new Date(payout.paid_at).toLocaleString("en-PH")}</strong>
          </div>
          <div>
            <span>Payment Method</span>
            <strong>{payout.payment_method.replaceAll("_", " ")}</strong>
          </div>
          <div>
            <span>Processed By</span>
            <strong>{payout.cashier_name ?? "—"}</strong>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>Job Order</th>
              <th>Service</th>
              <th>Service Amount</th>
              <th>Share</th>
              <th>Mechanic Earnings</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.job_order_number ?? "—"}</td>
                <td>{item.service_name ?? "—"}</td>
                <td>{money(item.service_amount)}</td>
                <td>{Number(item.mechanic_percentage).toFixed(2)}%</td>
                <td>{money(item.mechanic_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className={styles.total}>
          <span>TOTAL PAYOUT</span>
          <strong>{money(payout.total_amount)}</strong>
        </section>

        {payout.remarks ? (
          <section className={styles.remarks}>
            <span>Remarks</span>
            <p>{payout.remarks}</p>
          </section>
        ) : null}

        <section className={styles.signatures}>
          <div>
            <span>____________________________</span>
            <strong>Mechanic Signature</strong>
          </div>
          <div>
            <span>____________________________</span>
            <strong>Cashier Signature</strong>
          </div>
        </section>
      </section>
    </main>
  );
}
