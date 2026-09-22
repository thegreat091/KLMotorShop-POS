import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Bike,
  CalendarDays,
  Edit3,
  Phone,
  ReceiptText,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./view.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_code: string;
  client_name: string;
  mobile_number: string | null;
  remarks: string | null;
  is_active: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MotorcycleRow extends RowDataPacket {
  id: number;
  plate_number: string | null;
  model_name: string | null;
  is_active: number;
}

interface JobRow extends RowDataPacket {
  id: number;
  job_order_number: string;
  date_received: Date | string;
  status: string;
  priority: string;
  plate_number: string | null;
  model_name: string | null;
}

interface SaleRow extends RowDataPacket {
  id: number;
  sale_number: string;
  sale_date: Date | string;
  total_amount: number;
  payment_method: string;
  status: string;
}

export default async function ClientViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "OWNER", "CASHIER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [clientResult, motorcyclesResult, jobsResult, salesResult, totalsResult] =
    await Promise.all([
      pool.query<ClientRow[]>(
        `SELECT id, client_code, client_name, mobile_number, remarks, is_active, created_at, updated_at
         FROM clients WHERE id = ? LIMIT 1`,
        [id],
      ),
      pool.query<MotorcycleRow[]>(
        `SELECT m.id, m.plate_number, mm.model_name, m.is_active
         FROM motorcycles m
         LEFT JOIN motorcycle_models mm ON mm.id = m.model_id
         WHERE m.client_id = ?
         ORDER BY m.is_active DESC, m.id DESC`,
        [id],
      ),
      pool.query<JobRow[]>(
        `SELECT jo.id, jo.job_order_number, jo.date_received, jo.status, jo.priority,
                m.plate_number, mm.model_name
         FROM job_orders jo
         LEFT JOIN motorcycles m ON m.id = jo.motorcycle_id
         LEFT JOIN motorcycle_models mm ON mm.id = m.model_id
         WHERE jo.client_id = ?
         ORDER BY jo.date_received DESC, jo.id DESC
         LIMIT 8`,
        [id],
      ),
      pool.query<SaleRow[]>(
        `SELECT id, sale_number, sale_date, total_amount, payment_method, status
         FROM sales
         WHERE client_id = ?
         ORDER BY sale_date DESC, id DESC
         LIMIT 8`,
        [id],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM motorcycles WHERE client_id = ?) AS motorcycle_count,
           (SELECT COUNT(*) FROM job_orders WHERE client_id = ?) AS job_order_count,
           (SELECT COUNT(*) FROM sales WHERE client_id = ?) AS sales_count,
           (SELECT COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END),0)
              FROM sales WHERE client_id = ?) AS completed_sales_total`,
        [id, id, id, id],
      ),
    ]);

  const client = clientResult[0][0];
  if (!client) notFound();

  const motorcycles = motorcyclesResult[0];
  const jobs = jobsResult[0];
  const sales = salesResult[0];
  const totals = totalsResult[0][0];

  const peso = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(value));

  const date = (value: Date | string | null) =>
    value
      ? new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
        }).format(new Date(value))
      : "—";

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/clients" className={styles.back}>
          <ArrowLeft size={17} />
          Clients
        </Link>

        <div className={styles.heroRow}>
          <div className={styles.avatar}>
            <span>{client.client_name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p>Client Profile</p>
            <h1>{client.client_name}</h1>
            <span>{client.client_code}</span>
          </div>
          <span className={client.is_active ? styles.active : styles.inactive}>
            {client.is_active ? "Active" : "Inactive"}
          </span>
          <div className={styles.heroActions}>
            <Link href={`/clients/${client.id}`}><Edit3 size={15} /> Edit</Link>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.infoGrid}>
          <article className={styles.infoCard}>
            <Phone size={18} />
            <span>Mobile Number</span>
            <strong>{client.mobile_number || "Not provided"}</strong>
          </article>
          <article className={styles.infoCard}>
            <Bike size={18} />
            <span>Motorcycles</span>
            <strong>{Number(totals.motorcycle_count)}</strong>
          </article>
          <article className={styles.infoCard}>
            <Wrench size={18} />
            <span>Job Orders</span>
            <strong>{Number(totals.job_order_count)}</strong>
          </article>
          <article className={styles.infoCard}>
            <ReceiptText size={18} />
            <span>Total Sales</span>
            <strong>{peso(Number(totals.completed_sales_total))}</strong>
          </article>
        </div>

        <div className={styles.twoColumn}>
          <section className={styles.card} id="motorcycles">
            <header>
              <div>
                <p>Garage</p>
                <h2>Motorcycles</h2>
              </div>
              <span>{motorcycles.length}</span>
            </header>

            {motorcycles.length ? (
              <div className={styles.list}>
                {motorcycles.map((motorcycle) => (
                  <div className={styles.motorcycle} key={motorcycle.id}>
                    <div className={styles.bikeIcon}><Bike size={18} /></div>
                    <div>
                      <strong>{motorcycle.plate_number || "No plate number"}</strong>
                      <span>
{motorcycle.model_name || "Model not specified"}
                      </span>
                    </div>
                    <Link href={`/motorcycles/${motorcycle.id}`}>Open</Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptySmall}>No motorcycles registered.</div>
            )}
          </section>

          <section className={styles.card}>
            <header>
              <div>
                <p>Client Information</p>
                <h2>Notes &amp; dates</h2>
              </div>
              <CalendarDays size={18} />
            </header>
            <div className={styles.notes}>
              <div><span>Created</span><strong>{date(client.created_at)}</strong></div>
              <div><span>Last updated</span><strong>{date(client.updated_at)}</strong></div>
              <div><span>Remarks</span><strong>{client.remarks || "No remarks provided."}</strong></div>
            </div>
          </section>
        </div>

        <section className={styles.card}>
          <header>
            <div>
              <p>Workshop</p>
              <h2>Recent Job Orders</h2>
            </div>
            <Link href={`/job-orders?search=${encodeURIComponent(client.client_name)}`}>View all</Link>
          </header>

          {jobs.length ? (
            <div className={styles.historyTable}>
              <div className={styles.historyHead}><span>Job Order</span><span>Date</span><span>Motorcycle</span><span>Status</span></div>
              {jobs.map((job) => (
                <div className={styles.historyRow} key={job.id}>
                  <Link href={`/job-orders/${job.id}`}>{job.job_order_number}</Link>
                  <span>{date(job.date_received)}</span>
                  <span>{job.plate_number || "—"}{job.model_name ? ` • ${job.model_name}` : ""}</span>
                  <span className={styles.status}>{job.status.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySmall}>No job orders yet.</div>
          )}
        </section>

        <section className={styles.card}>
          <header>
            <div>
              <p>Sales &amp; Receipts</p>
              <h2>Recent Sales</h2>
            </div>
            <Link href={`/sales?q=${encodeURIComponent(client.client_name)}`}>View all</Link>
          </header>

          {sales.length ? (
            <div className={styles.historyTable}>
              <div className={styles.historyHead}><span>Receipt</span><span>Date</span><span>Payment</span><span>Total</span></div>
              {sales.map((sale) => (
                <div className={styles.historyRow} key={sale.id}>
                  <Link href={`/pos/receipt/${sale.id}`}>{sale.sale_number}</Link>
                  <span>{date(sale.sale_date)}</span>
                  <span>{sale.payment_method.replaceAll("_", " ")}</span>
                  <strong>{peso(Number(sale.total_amount))}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySmall}>No sales yet.</div>
          )}
        </section>
      </section>
    </main>
  );
}
