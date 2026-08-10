import type { RowDataPacket } from "mysql2";
import { ArrowLeft, ClipboardPenLine } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import AdjustmentForm from "./adjustment-form";
import styles from "../stock-adjustments.module.css";

interface BatchRow extends RowDataPacket {
  id: number;
  product_code: string;
  product_name: string;
  batch_number: string;
  barcode: string;
  quantity_remaining: number;
  unit: string;
  status: string;
}

export default async function NewStockAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "INVENTORY") redirect("/dashboard");

  const query = await searchParams;
  const [batches] = await pool.query<BatchRow[]>(
    `
      SELECT
        sib.id,
        p.product_code,
        p.product_name,
        sib.batch_number,
        sib.barcode,
        sib.quantity_remaining,
        p.unit,
        sib.status
      FROM stock_in_batches sib
      JOIN products p ON p.id = sib.product_id
      WHERE sib.status <> 'CANCELLED'
        AND p.is_active = 1
      ORDER BY p.product_name, sib.received_at DESC, sib.id DESC
    `,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/inventory/stock-adjustments" className={styles.backButton}>
            <ArrowLeft size={19} /> Inventory Transactions
          </Link>
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}><ClipboardPenLine size={28} /></div>
            <div>
              <p>Inventory</p>
              <h1>Stock Out / Adjustment</h1>
              <span>Record a controlled manual quantity change against a specific batch.</span>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {query.error ? <div className={styles.errorMessage}>{query.error}</div> : null}
        {batches.length === 0 ? (
          <div className={styles.warningMessage}>
            No stock-in batches are available yet. Receive products through Stock In first.
          </div>
        ) : (
          <AdjustmentForm
            batches={batches.map((batch) => ({
              id: batch.id,
              productCode: batch.product_code,
              productName: batch.product_name,
              batchNumber: batch.batch_number,
              barcode: batch.barcode,
              remaining: Number(batch.quantity_remaining),
              unit: batch.unit,
              status: batch.status,
            }))}
          />
        )}
      </section>
    </main>
  );
}
