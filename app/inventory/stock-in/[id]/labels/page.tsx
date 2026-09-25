import type { RowDataPacket } from "mysql2";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import StockInQrCode from "./qr-code";
import PrintButton from "./print-button";
import styles from "./labels.module.css";

interface LabelRow extends RowDataPacket {
  product_code: string;
  product_name: string;
  selling_price: number;
  batch_number: string;
  barcode: string;
  quantity_received: number;
}

const LABELS_PER_PAGE = 65;

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export default async function LabelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "INVENTORY", "OWNER"].includes(user.role)) redirect("/dashboard");

  const { id } = await params;
  const stockInId = Number(id);
  if (!Number.isInteger(stockInId) || stockInId <= 0) notFound();

  const [rows] = await pool.query<LabelRow[]>(
    `SELECT
       p.product_code,
       p.product_name,
       sib.selling_price,
       sib.batch_number,
       sib.barcode,
       sib.quantity_received
     FROM stock_in_batches sib
     JOIN products p ON p.id = sib.product_id
     WHERE sib.stock_transaction_id = ?
     ORDER BY sib.id`,
    [stockInId],
  );

  if (rows.length === 0) notFound();

  const labels = rows.flatMap((row) =>
    Array.from({ length: Number(row.quantity_received) }, (_, index) => ({
      ...row,
      copy: index + 1,
    })),
  );

  const pages = Array.from(
    { length: Math.ceil(labels.length / LABELS_PER_PAGE) },
    (_, pageIndex) => labels.slice(pageIndex * LABELS_PER_PAGE, (pageIndex + 1) * LABELS_PER_PAGE),
  );

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/inventory/stock-in/${stockInId}`}>
          <ArrowLeft size={17} /> Back
        </Link>
        <div>
          <strong>{labels.length} QR label{labels.length === 1 ? "" : "s"}</strong>
          <span>{pages.length} A4 page{pages.length === 1 ? "" : "s"} · 65 labels maximum per page</span>
        </div>
        <PrintButton />
      </div>

      <section className={styles.pages}>
        {pages.map((pageLabels, pageIndex) => (
          <div className={styles.printPage} key={`page-${pageIndex + 1}`}>
            <div className={styles.grid}>
              {pageLabels.map((label, index) => (
                <article
                  className={styles.label}
                  key={`${label.batch_number}-${label.copy}-${pageIndex}-${index}`}
                >
                  <div className={styles.shop}>KL MOTOR SHOP</div>
                  <div className={styles.labelBody}>
                    <div className={styles.qr}>
                      <StockInQrCode value={label.barcode} />
                    </div>
                    <div className={styles.info}>
                      <div className={styles.name}>{label.product_name}</div>
                      <div className={styles.price}>{peso(Number(label.selling_price))}</div>
                      <div className={styles.code}>{label.product_code}</div>
                      <div className={styles.batch}>Batch: {label.batch_number}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.pageNo}>Page {pageIndex + 1} of {pages.length}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
