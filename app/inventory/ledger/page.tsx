import type { RowDataPacket } from "mysql2";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  BookOpenText,
  CalendarDays,
  PackageSearch,
  Search,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./ledger.module.css";

type MovementType =
  | "OPENING"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "SALE"
  | "JOB_ORDER"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RETURN_IN"
  | "RETURN_OUT";

interface LedgerRow extends RowDataPacket {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_barcode: string | null;
  unit: string;
  movement_type: MovementType;
  reference_table: string | null;
  reference_id: string | null;
  reference_number: string | null;
  quantity_in: number;
  quantity_out: number;
  balance_after: number;
  unit_cost: number;
  remarks: string | null;
  user_name: string | null;
  created_at: Date;
}

interface SummaryRow extends RowDataPacket {
  movement_count: number;
  total_in: number;
  total_out: number;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function movementLabel(type: MovementType) {
  const labels: Record<MovementType, string> = {
    OPENING: "Opening",
    STOCK_IN: "Stock In",
    STOCK_OUT: "Stock Out",
    SALE: "Sale",
    JOB_ORDER: "Job Order",
    ADJUSTMENT_IN: "Adjustment In",
    ADJUSTMENT_OUT: "Adjustment Out",
    RETURN_IN: "Return In",
    RETURN_OUT: "Return Out",
  };
  return labels[type];
}

function movementClass(type: MovementType) {
  if (["OPENING", "STOCK_IN", "ADJUSTMENT_IN", "RETURN_IN"].includes(type)) {
    return styles.inBadge;
  }
  return styles.outBadge;
}

const movementOptions: MovementType[] = [
  "OPENING",
  "STOCK_IN",
  "STOCK_OUT",
  "SALE",
  "JOB_ORDER",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "RETURN_IN",
  "RETURN_OUT",
];

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "INVENTORY", "OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const requestedType = params.type?.trim() ?? "";
  const type = movementOptions.includes(requestedType as MovementType)
    ? requestedType
    : "";
  const from = params.from?.trim() ?? "";
  const to = params.to?.trim() ?? "";
  const like = `%${search}%`;

  const query = `
    SELECT
      im.id,
      im.product_id,
      p.product_code,
      p.product_name,
      p.barcode AS product_barcode,
      p.unit,
      im.movement_type,
      im.reference_table,
      im.reference_id,
      COALESCE(st.reference_number, s.sale_number, im.reference_id) AS reference_number,
      im.quantity_in,
      im.quantity_out,
      im.balance_after,
      im.unit_cost,
      im.remarks,
      u.full_name AS user_name,
      im.created_at
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    LEFT JOIN users u ON u.id = im.created_by
    LEFT JOIN stock_transactions st
      ON im.reference_table = 'stock_transactions'
     AND st.id = CAST(im.reference_id AS UNSIGNED)
    LEFT JOIN sales s
      ON im.reference_table = 'sales'
     AND s.id = CAST(im.reference_id AS UNSIGNED)
    WHERE
      (? = '' OR im.movement_type = ?)
      AND (? = '' OR DATE(im.created_at) >= ?)
      AND (? = '' OR DATE(im.created_at) <= ?)
      AND (
        ? = '' OR
        p.product_code LIKE ? OR
        p.product_name LIKE ? OR
        COALESCE(p.barcode, '') LIKE ? OR
        COALESCE(st.reference_number, '') LIKE ? OR
        COALESCE(s.sale_number, '') LIKE ? OR
        COALESCE(im.reference_id, '') LIKE ? OR
        COALESCE(im.remarks, '') LIKE ?
      )
    ORDER BY im.created_at DESC, im.id DESC
    LIMIT 1000
  `;

  const values = [
    type,
    type,
    from,
    from,
    to,
    to,
    search,
    like,
    like,
    like,
    like,
    like,
    like,
    like,
  ];

  const [rows] = await pool.execute<LedgerRow[]>(query, values);

  const [summaryRows] = await pool.execute<SummaryRow[]>(
    `
      SELECT
        COUNT(*) AS movement_count,
        COALESCE(SUM(im.quantity_in), 0) AS total_in,
        COALESCE(SUM(im.quantity_out), 0) AS total_out
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      LEFT JOIN stock_transactions st
        ON im.reference_table = 'stock_transactions'
       AND st.id = CAST(im.reference_id AS UNSIGNED)
      LEFT JOIN sales s
        ON im.reference_table = 'sales'
       AND s.id = CAST(im.reference_id AS UNSIGNED)
      WHERE
        (? = '' OR im.movement_type = ?)
        AND (? = '' OR DATE(im.created_at) >= ?)
        AND (? = '' OR DATE(im.created_at) <= ?)
        AND (
          ? = '' OR
          p.product_code LIKE ? OR
          p.product_name LIKE ? OR
          COALESCE(p.barcode, '') LIKE ? OR
          COALESCE(st.reference_number, '') LIKE ? OR
          COALESCE(s.sale_number, '') LIKE ? OR
          COALESCE(im.reference_id, '') LIKE ? OR
          COALESCE(im.remarks, '') LIKE ?
        )
    `,
    values,
  );

  const summary = summaryRows[0] ?? {
    movement_count: 0,
    total_in: 0,
    total_out: 0,
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/dashboard" className={styles.backButton}>
            <ArrowLeft size={18} /> Dashboard
          </Link>
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}>
              <BookOpenText size={28} />
            </div>
            <div>
              <p>Inventory</p>
              <h1>Inventory Ledger</h1>
              <span>Official audit trail of every product stock movement.</span>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}><BookOpenText size={21} /></div>
            <div><span>Movements</span><strong>{Number(summary.movement_count)}</strong></div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}><ArrowDownToLine size={21} /></div>
            <div><span>Total Stock In</span><strong>+{formatNumber(Number(summary.total_in))}</strong></div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}><ArrowUpFromLine size={21} /></div>
            <div><span>Total Stock Out</span><strong>-{formatNumber(Number(summary.total_out))}</strong></div>
          </article>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <p>Audit Trail</p>
              <h2>Stock movements</h2>
            </div>
            <span>{rows.length >= 1000 ? "Latest 1,000 records" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}</span>
          </header>

          <form className={styles.filters}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input
                name="search"
                defaultValue={search}
                placeholder="Product, barcode, batch, sale or stock reference..."
              />
            </label>

            <select name="type" defaultValue={type} aria-label="Movement type">
              <option value="">All movement types</option>
              {movementOptions.map((option) => (
                <option key={option} value={option}>{movementLabel(option)}</option>
              ))}
            </select>

            <label className={styles.dateBox}>
              <CalendarDays size={17} />
              <input type="date" name="from" defaultValue={from} title="From date" />
            </label>
            <label className={styles.dateBox}>
              <CalendarDays size={17} />
              <input type="date" name="to" defaultValue={to} title="To date" />
            </label>

            <button type="submit">Filter</button>
            <Link href="/inventory/ledger" className={styles.resetButton}>Reset</Link>
          </form>

          {rows.length === 0 ? (
            <div className={styles.emptyState}>
              <PackageSearch size={34} />
              <h3>No inventory movements found</h3>
              <p>Try changing the filters or perform a Stock In, sale, or adjustment first.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.ledgerTable}>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Product</th>
                    <th>Movement</th>
                    <th>Reference</th>
                    <th className={styles.numberCell}>In</th>
                    <th className={styles.numberCell}>Out</th>
                    <th className={styles.numberCell}>Balance</th>
                    <th>User</th>
                    <th>Remarks / Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.dateCell}>{formatDateTime(row.created_at)}</td>
                      <td>
                        <Link href={`/products/${row.product_id}`} className={styles.productLink}>
                          <strong>{row.product_name}</strong>
                          <span>{row.product_code}{row.product_barcode ? ` • ${row.product_barcode}` : ""}</span>
                        </Link>
                      </td>
                      <td><span className={`${styles.typeBadge} ${movementClass(row.movement_type)}`}>{movementLabel(row.movement_type)}</span></td>
                      <td><span className={styles.reference}>{row.reference_number || "—"}</span></td>
                      <td className={`${styles.numberCell} ${styles.inQty}`}>{Number(row.quantity_in) > 0 ? `+${formatNumber(Number(row.quantity_in))}` : "—"}</td>
                      <td className={`${styles.numberCell} ${styles.outQty}`}>{Number(row.quantity_out) > 0 ? `-${formatNumber(Number(row.quantity_out))}` : "—"}</td>
                      <td className={styles.numberCell}><strong>{formatNumber(Number(row.balance_after))}</strong> <small>{row.unit}</small></td>
                      <td>{row.user_name || "System"}</td>
                      <td className={styles.remarks}>{row.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
