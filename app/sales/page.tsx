import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  Filter,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
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

interface CashierRow extends RowDataPacket {
  id: number;
  full_name: string;
}

interface SummaryRow extends RowDataPacket {
  transactions: number;
  net_sales: number;
  cash_sales: number;
  non_cash_sales: number;
  completed_count: number;
  voided_count: number;
  refunded_count: number;
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "VOIDED") return styles.statusVoided;
  if (status === "REFUNDED") return styles.statusRefunded;
  return styles.statusCompleted;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDate(value: Date) {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function validDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    cashier?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "CASHIER", "OWNER"].includes(user.role)) redirect("/dashboard");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = (params.status ?? "").trim().toUpperCase();
  const payment = (params.payment ?? "").trim().toUpperCase();
  const cashier = (params.cashier ?? "").trim();
  const cashierId = cashier ? Number(cashier) : 0;

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const from = validDate(
    params.from,
    localDate(monthStart),
  );
  const to = validDate(
    params.to,
    localDate(today),
  );

  const like = `%${q}%`;

  const filters = `
    s.sale_date >= ?
    AND s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)
    AND (
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = ''
      OR CONVERT(s.sale_number USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      OR CONVERT(COALESCE(jo.job_order_number, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      OR CONVERT(COALESCE(c.client_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      OR CONVERT(COALESCE(m.plate_number, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
    )
    AND (
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = ''
      OR CONVERT(s.status USING utf8mb4) COLLATE utf8mb4_unicode_ci
        = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
    )
    AND (
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = ''
      OR CONVERT(s.payment_method USING utf8mb4) COLLATE utf8mb4_unicode_ci
        = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
    )
    AND (
      ? = 0
      OR s.cashier_id = ?
    )
  `;

  const baseArgs = [
    from,
    to,
    q,
    like,
    like,
    like,
    like,
    status,
    status,
    payment,
    payment,
    cashierId,
    cashierId,
  ];

  const [rowsResult, summaryResult, cashiersResult] = await Promise.all([
    pool.execute<SaleHistoryRow[]>(
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
        WHERE ${filters}
        ORDER BY s.sale_date DESC, s.id DESC
        LIMIT 500
      `,
      baseArgs,
    ),
    pool.execute<SummaryRow[]>(
      `
        SELECT
          COUNT(*) AS transactions,
          COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) AS net_sales,
          COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' AND s.payment_method = 'CASH' THEN s.total_amount ELSE 0 END), 0) AS cash_sales,
          COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' AND s.payment_method <> 'CASH' THEN s.total_amount ELSE 0 END), 0) AS non_cash_sales,
          SUM(s.status = 'COMPLETED') AS completed_count,
          SUM(s.status = 'VOIDED') AS voided_count,
          SUM(s.status = 'REFUNDED') AS refunded_count
        FROM sales s
        LEFT JOIN job_orders jo ON jo.id = s.job_order_id
        LEFT JOIN clients c ON c.id = s.client_id
        LEFT JOIN motorcycles m ON m.id = s.motorcycle_id
        WHERE ${filters}
      `,
      baseArgs,
    ),
    pool.execute<CashierRow[]>(
      `
        SELECT id, full_name
        FROM users
        WHERE role IN ('ADMIN', 'CASHIER')
        ORDER BY full_name ASC
      `,
    ),
  ]);

  const rows = rowsResult[0];
  const summary = summaryResult[0][0] ?? {
    transactions: 0,
    net_sales: 0,
    cash_sales: 0,
    non_cash_sales: 0,
    completed_count: 0,
    voided_count: 0,
    refunded_count: 0,
  };
  const cashiers = cashiersResult[0];

  const hasFilters = Boolean(
    q ||
      status ||
      payment ||
      cashier ||
      params.from ||
      params.to,
  );

  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={17} />
        Dashboard
      </Link>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.eyebrow}>Sales &amp; Receipts</div>
          <h1>Sales History</h1>
          <p>
            Review completed transactions, track payments, and reprint receipts
            without creating a new sale.
          </p>
        </div>

        <div className={styles.count}>
          <ReceiptText size={19} />
          <strong>{rows.length}</strong>
          records
        </div>
      </section>

      <section className={styles.metrics}>
        <article className={styles.metric}>
          <div className={styles.metricIcon}><ReceiptText size={18} /></div>
          <span>Transactions</span>
          <strong>{Number(summary.transactions)}</strong>
          <small>Within selected filters</small>
        </article>

        <article className={`${styles.metric} ${styles.metricSales}`}>
          <div className={styles.metricIcon}><CheckCircle2 size={18} /></div>
          <span>Completed Sales</span>
          <strong>{peso(Number(summary.net_sales))}</strong>
          <small>{Number(summary.completed_count)} completed transaction(s)</small>
        </article>

        <article className={`${styles.metric} ${styles.metricCash}`}>
          <div className={styles.metricIcon}>₱</div>
          <span>Cash Sales</span>
          <strong>{peso(Number(summary.cash_sales))}</strong>
          <small>Completed cash payments</small>
        </article>

        <article className={`${styles.metric} ${styles.metricNonCash}`}>
          <div className={styles.metricIcon}><CreditCard size={18} /></div>
          <span>Non-Cash Sales</span>
          <strong>{peso(Number(summary.non_cash_sales))}</strong>
          <small>GCash, card, bank &amp; other</small>
        </article>

        <article className={`${styles.metric} ${styles.metricVoided}`}>
          <div className={styles.metricIcon}><XCircle size={18} /></div>
          <span>Voided</span>
          <strong>{Number(summary.voided_count)}</strong>
          <small>Excluded from completed sales</small>
        </article>

        <article className={`${styles.metric} ${styles.metricRefunded}`}>
          <div className={styles.metricIcon}>↩</div>
          <span>Refunded</span>
          <strong>{Number(summary.refunded_count)}</strong>
          <small>Refunded transactions</small>
        </article>
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

        <label>
          <span>Status</span>
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </label>

        <label>
          <span>Payment</span>
          <select name="payment" defaultValue={payment}>
            <option value="">All payments</option>
            {["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"].map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Cashier</span>
          <select name="cashier" defaultValue={cashier}>
            <option value="">All cashiers</option>
            {cashiers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>From</span>
          <input type="date" name="from" defaultValue={from} />
        </label>

        <label>
          <span>To</span>
          <input type="date" name="to" defaultValue={to} />
        </label>

        <button type="submit" className={styles.searchButton}>
          <Filter size={16} />
          Apply Filters
        </button>

        {hasFilters ? (
          <Link href="/sales" className={styles.resetButton}>
            <RotateCcw size={15} />
            Reset
          </Link>
        ) : null}
      </form>

      <div className={styles.resultsBar}>
        <div>
          Showing <strong>{rows.length}</strong>{" "}
          {rows.length === 1 ? "transaction" : "transactions"}
        </div>
        <span>
          {from} to {to}
        </span>
      </div>

      <section className={styles.tableCard}>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Customer / Motorcycle</th>
                <th>Sale Type</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {rows.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <Link
                      href={`/pos/receipt/${sale.id}`}
                      className={styles.receiptLink}
                    >
                      {sale.sale_number}
                    </Link>
                  </td>

                  <td>
                    <div className={styles.dateMain}>
                      {formatDate(sale.sale_date)}
                    </div>
                    <div className={styles.dateTime}>
                      {formatTime(sale.sale_date)}
                    </div>
                  </td>

                  <td>
                    <div className={styles.customer}>
                      {sale.client_name ?? "Walk-in Customer"}
                    </div>
                    <small>{sale.plate_number ?? "No motorcycle"}</small>
                  </td>

                  <td>
                    {sale.job_order_number ? (
                      <div className={styles.saleType}>
                        <strong>Workshop</strong>
                        <small>{sale.job_order_number}</small>
                      </div>
                    ) : (
                      <div className={styles.saleType}>
                        <strong>Direct Sale</strong>
                        <small>POS transaction</small>
                      </div>
                    )}
                  </td>

                  <td>
                    <div className={styles.cashier}>
                      <span className={styles.cashierAvatar}>
                        {(sale.cashier_name ?? "S").charAt(0).toUpperCase()}
                      </span>
                      {sale.cashier_name ?? "—"}
                    </div>
                  </td>

                  <td>
                    <span className={styles.payment}>
                      {sale.payment_method.replaceAll("_", " ")}
                    </span>
                  </td>

                  <td className={styles.money}>
                    {peso(Number(sale.total_amount))}
                  </td>

                  <td>
                    <span className={`${styles.status} ${statusClass(sale.status)}`}>
                      {formatStatus(sale.status)}
                    </span>
                  </td>

                  <td className={styles.actionCell}>
                    <Link
                      href={`/pos/receipt/${sale.id}`}
                      className={styles.actionButton}
                    >
                      <Eye size={14} />
                      View / Reprint
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            <ReceiptText size={34} />
            <strong>No sales found</strong>
            <p>Try changing your filters or date range.</p>
          </div>
        )}
      </section>
    </main>
  );
}
