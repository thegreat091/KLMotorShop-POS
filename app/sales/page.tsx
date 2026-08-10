import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Printer, ReceiptText, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./sales.module.css";

interface SaleHistoryRow extends RowDataPacket {
  id: number;
  sale_number: string;
  job_order_number: string | null;
  sale_date: Date;
  client_name: string | null;
  plate_number: string | null;
  total_amount: number;
  payment_method: string;
  status: string;
  cashier_name: string | null;
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "CASHIER", "OWNER"].includes(user.role)) redirect("/dashboard");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = (params.status ?? "").trim();
  const like = `%${q}%`;

  const [rows] = await pool.execute<SaleHistoryRow[]>(
    `
      SELECT
        s.id,
        s.sale_number,
        jo.job_order_number,
        s.sale_date,
        c.client_name,
        m.plate_number,
        s.total_amount,
        s.payment_method,
        s.status,
        u.full_name AS cashier_name
      FROM sales s
      LEFT JOIN job_orders jo ON jo.id = s.job_order_id
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN motorcycles m ON m.id = s.motorcycle_id
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE (
        CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = '' OR
        CONVERT(s.sale_number USING utf8mb4) COLLATE utf8mb4_unicode_ci
          LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR
        CONVERT(COALESCE(jo.job_order_number, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
          LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR
        CONVERT(COALESCE(c.client_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
          LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR
        CONVERT(COALESCE(m.plate_number, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
          LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      )
      AND (
        CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = '' OR
        CONVERT(s.status USING utf8mb4) COLLATE utf8mb4_unicode_ci
          = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      )
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT 250
    `,
    [q, like, like, like, like, status, status],
  );

  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={17} /> Dashboard
      </Link>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Sales &amp; Receipts</div>
          <h1>Sales History</h1>
          <p>Find completed transactions and reprint their receipts without creating a new sale.</p>
        </div>
        <div className={styles.count}><ReceiptText size={19} /> {rows.length} records</div>
      </section>

      <form className={styles.filters}>
        <label className={styles.searchBox}>
          <Search size={18} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Receipt, job order, customer, or plate number"
          />
        </label>
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOIDED">Voided</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button type="submit">Search</button>
      </form>

      <section className={styles.tableCard}>
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Customer / Motorcycle</th>
              <th>Job Order</th>
              <th>Cashier</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((sale) => (
              <tr key={sale.id}>
                <td><strong>{sale.sale_number}</strong></td>
                <td>{new Date(sale.sale_date).toLocaleString("en-PH")}</td>
                <td>
                  <strong>{sale.client_name ?? "Walk-in Customer"}</strong>
                  <small>{sale.plate_number ?? "No motorcycle"}</small>
                </td>
                <td>{sale.job_order_number ?? "Direct Sale"}</td>
                <td>{sale.cashier_name ?? "-"}</td>
                <td>{sale.payment_method.replaceAll("_", " ")}</td>
                <td className={styles.money}>{peso(Number(sale.total_amount))}</td>
                <td><span className={styles.status}>{sale.status}</span></td>
                <td className={styles.actionCell}>
                  <Link href={`/pos/receipt/${sale.id}`}>
                    <Printer size={15} /> Reprint Receipt
                  </Link>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={9} className={styles.empty}>No sales found.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
