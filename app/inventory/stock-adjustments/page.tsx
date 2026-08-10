import type { RowDataPacket } from "mysql2";
import { ArrowLeft, ClipboardPenLine, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./stock-adjustments.module.css";

interface TransactionRow extends RowDataPacket {
  id: number;
  reference_number: string;
  transaction_type: "STOCK_OUT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  transaction_date: Date;
  remarks: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  batch_number: string | null;
  user_name: string | null;
}

function typeLabel(type: TransactionRow["transaction_type"]) {
  if (type === "STOCK_OUT") return "Stock Out";
  if (type === "ADJUSTMENT_IN") return "Adjustment In";
  return "Adjustment Out";
}

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; success?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "INVENTORY", "OWNER"].includes(user.role)) redirect("/dashboard");

  const canCreate = user.role === "ADMIN" || user.role === "INVENTORY";
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const type = params.type?.trim() ?? "";

  const [rows] = await pool.query<TransactionRow[]>(
    `
      SELECT
        st.id,
        st.reference_number,
        st.transaction_type,
        st.transaction_date,
        st.remarks,
        p.product_code,
        p.product_name,
        sti.quantity,
        p.unit,
        (
          SELECT sib.batch_number
          FROM inventory_movements im
          JOIN stock_in_batches sib
            ON im.remarks COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', sib.batch_number COLLATE utf8mb4_unicode_ci, '%')
          WHERE im.reference_table = 'stock_transactions'
            AND im.reference_id COLLATE utf8mb4_unicode_ci = CAST(st.id AS CHAR) COLLATE utf8mb4_unicode_ci
            AND im.product_id = p.id
          ORDER BY im.id DESC
          LIMIT 1
        ) AS batch_number,
        u.full_name AS user_name
      FROM stock_transactions st
      JOIN stock_transaction_items sti ON sti.stock_transaction_id = st.id
      JOIN products p ON p.id = sti.product_id
      LEFT JOIN users u ON u.id = st.created_by
      WHERE st.transaction_type IN ('STOCK_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')
        AND (? = '' OR st.transaction_type = ?)
        AND (
          ? = '' OR
          st.reference_number LIKE ? OR
          p.product_code LIKE ? OR
          p.product_name LIKE ? OR
          st.remarks LIKE ?
        )
      ORDER BY st.transaction_date DESC, st.id DESC
    `,
    [type, type, search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`],
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/dashboard" className={styles.backButton}><ArrowLeft size={19} /> Dashboard</Link>
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}><ClipboardPenLine size={28} /></div>
            <div>
              <p>Inventory</p>
              <h1>Stock Out & Adjustments</h1>
              <span>Track non-sale stock releases and physical-count corrections.</span>
            </div>
          </div>
        </div>
        {canCreate ? (
          <Link href="/inventory/stock-adjustments/new" className={styles.addButton}>
            <ClipboardPenLine size={19} /> New Transaction
          </Link>
        ) : null}
      </header>

      <section className={styles.content}>
        {params.success ? <div className={styles.successMessage}>{params.success}</div> : null}
        {params.error ? <div className={styles.errorMessage}>{params.error}</div> : null}

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div><p>History</p><h2>Manual inventory movements</h2></div>
            <span>{rows.length} transaction{rows.length === 1 ? "" : "s"}</span>
          </header>

          <form className={styles.filters}>
            <label>
              <Search size={18} />
              <input name="search" defaultValue={search} placeholder="Search reference, product, reason..." />
            </label>
            <select name="type" defaultValue={type}>
              <option value="">All types</option>
              <option value="STOCK_OUT">Stock Out</option>
              <option value="ADJUSTMENT_IN">Adjustment In</option>
              <option value="ADJUSTMENT_OUT">Adjustment Out</option>
            </select>
            <button type="submit">Filter</button>
            <Link href="/inventory/stock-adjustments">Reset</Link>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reference</th><th>Date</th><th>Type</th><th>Product</th>
                  <th>Batch</th><th>Qty</th><th>Reason / Remarks</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8}><div className={styles.empty}>No stock-out or adjustment transactions yet.</div></td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.reference_number}</strong></td>
                    <td>{new Date(row.transaction_date).toLocaleString("en-PH")}</td>
                    <td><span className={`${styles.typeBadge} ${styles[row.transaction_type.toLowerCase()]}`}>{typeLabel(row.transaction_type)}</span></td>
                    <td><strong>{row.product_code}</strong><br /><span>{row.product_name}</span></td>
                    <td>{row.batch_number ?? "—"}</td>
                    <td><strong>{Number(row.quantity)} {row.unit}</strong></td>
                    <td>{row.remarks ?? "—"}</td>
                    <td>{row.user_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
