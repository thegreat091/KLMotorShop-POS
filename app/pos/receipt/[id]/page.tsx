import type { RowDataPacket } from "mysql2";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { PrintReceiptButton } from "./print-button";
import Barcode39 from "./Barcode39";
import styles from "./receipt.module.css";

interface SaleRow extends RowDataPacket {
  id: number;
  sale_number: string;
  job_order_id: number | null;
  sale_date: Date;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  amount_tendered: number;
  change_amount: number;
  payment_method: string;
  status: string;
  client_name: string | null;
  mobile_number: string | null;
  cashier_name: string | null;
  motorcycle_id: number | null;
  plate_number: string | null;
  model_name: string | null;
  job_order_number: string | null;
  customer_concern: string | null;
  diagnosis: string | null;
  job_remarks: string | null;
  mechanic_name: string | null;
}

interface ItemRow extends RowDataPacket {
  product_code: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  batch_number: string | null;
}

interface ServiceRow extends RowDataPacket {
  service_name: string;
  service_charge: number;
  mechanic_name: string | null;
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "CASHIER" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isInteger(saleId) || saleId <= 0) notFound();

  const [sales] = await pool.query<SaleRow[]>(
    `
      SELECT
        s.id,
        s.sale_number,
        s.job_order_id,
        s.sale_date,
        s.subtotal,
        s.discount_amount,
        s.total_amount,
        s.amount_tendered,
        s.change_amount,
        s.payment_method,
        s.status,
        c.client_name,
        c.mobile_number,
        u.full_name AS cashier_name,
        s.motorcycle_id,
        m.plate_number,
        mm.model_name,
        jo.job_order_number,
        jo.customer_concern,
        jo.diagnosis,
        jo.remarks AS job_remarks,
        mech.full_name AS mechanic_name
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN users u ON u.id = s.cashier_id
      LEFT JOIN motorcycles m ON m.id = s.motorcycle_id
      LEFT JOIN motorcycle_models mm ON mm.id = m.model_id
      LEFT JOIN job_orders jo ON jo.id = s.job_order_id
      LEFT JOIN mechanics mech ON mech.id = jo.assigned_mechanic_id
      WHERE s.id = ?
      LIMIT 1
    `,
    [saleId],
  );

  const sale = sales[0];
  if (!sale) notFound();

  const [items] = await pool.query<ItemRow[]>(
    `
      SELECT
        si.product_code,
        si.product_name,
        si.quantity,
        si.unit_price,
        si.discount_amount,
        si.line_total,
        sib.batch_number
      FROM sale_items si
      LEFT JOIN sale_item_batches sib ON sib.sale_item_id = si.id
      WHERE si.sale_id = ?
      ORDER BY si.id
    `,
    [saleId],
  );

  let services: ServiceRow[] = [];
  if (sale.job_order_id) {
    const [serviceRows] = await pool.query<ServiceRow[]>(
      `
        SELECT
          jos.service_name,
          jos.service_charge,
          m.full_name AS mechanic_name
        FROM job_order_services jos
        LEFT JOIN mechanics m ON m.id = jos.mechanic_id
        WHERE jos.job_order_id = ?
          AND jos.status <> 'CANCELLED'
        ORDER BY jos.id
      `,
      [sale.job_order_id],
    );
    services = serviceRows;
  }

  const partsTotal = items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const servicesTotal = services.reduce(
    (sum, service) => sum + Number(service.service_charge),
    0,
  );

  return (
    <main className={styles.page}>
      <div className={styles.actions}>
        <Link href="/pos">New Sale</Link>
        {sale.job_order_id ? (
          <Link href={`/job-orders/${sale.job_order_id}`}>Job Order</Link>
        ) : null}
        <Link href="/dashboard">Dashboard</Link>
        <PrintReceiptButton />
      </div>

      <article className={styles.document}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>MOTORCYCLE PARTS &amp; SERVICE</p>
            <h1>KL MOTOR SHOP</h1>
            <p className={styles.subtitle}>Service Invoice / Sales Receipt</p>
          </div>

          <div className={styles.documentNumberWrap}>
            <div className={styles.documentNumber}>
              <span>Receipt No.</span>
              <strong>{sale.sale_number}</strong>
              {sale.job_order_number ? (
                <>
                  <span>Job Order</span>
                  <strong>{sale.job_order_number}</strong>
                </>
              ) : null}
            </div>
            {sale.job_order_number ? (
              <div className={styles.jobBarcode}>
                <Barcode39 value={sale.job_order_number} />
                <span>{sale.job_order_number}</span>
              </div>
            ) : null}
          </div>
        </header>

        <section className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <h2>Transaction Information</h2>
            <dl>
              <div><dt>Date</dt><dd>{formatDate(sale.sale_date)}</dd></div>
              <div><dt>Cashier</dt><dd>{sale.cashier_name ?? "-"}</dd></div>
              <div><dt>Payment</dt><dd>{sale.payment_method.replaceAll("_", " ")}</dd></div>
              <div><dt>Status</dt><dd>{sale.status}</dd></div>
            </dl>
          </div>

          <div className={styles.infoCard}>
            <h2>Customer Information</h2>
            <dl>
              <div><dt>Customer</dt><dd>{sale.client_name ?? "Walk-in Customer"}</dd></div>
              <div><dt>Contact</dt><dd>{sale.mobile_number ?? "-"}</dd></div>
              <div><dt>Motorcycle</dt><dd>{sale.model_name ?? "-"}</dd></div>
              <div><dt>Plate No.</dt><dd>{sale.plate_number ?? "-"}</dd></div>
            </dl>
          </div>
        </section>

        {sale.job_order_id ? (
          <section className={styles.jobSection}>
            <div className={styles.sectionTitle}>
              <h2>Job Order Details</h2>
              <span>Mechanic: <strong>{sale.mechanic_name ?? "-"}</strong></span>
            </div>
            <div className={styles.jobNotes}>
              <div>
                <span>Customer Concern</span>
                <p>{sale.customer_concern || "-"}</p>
              </div>
              <div>
                <span>Diagnosis / Inspection</span>
                <p>{sale.diagnosis || "-"}</p>
              </div>
            </div>
            {sale.job_remarks ? (
              <div className={styles.remarks}>
                <span>Remarks</span>
                <p>{sale.job_remarks}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className={styles.tableSection}>
          <div className={styles.sectionTitle}>
            <h2>Products / Parts</h2>
            <strong>{peso(partsTotal)}</strong>
          </div>

          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.qty}>Qty</th>
                <th>Description</th>
                <th>Code / Batch</th>
                <th className={styles.money}>Unit Price</th>
                <th className={styles.money}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((item, index) => (
                <tr key={`${item.product_name}-${index}`}>
                  <td className={styles.qty}>{Number(item.quantity)}</td>
                  <td><strong>{item.product_name}</strong></td>
                  <td className={styles.codeCell}>
                    {item.product_code ?? "-"}
                    {item.batch_number ? <small>{item.batch_number}</small> : null}
                  </td>
                  <td className={styles.money}>{peso(Number(item.unit_price))}</td>
                  <td className={styles.money}>{peso(Number(item.line_total))}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className={styles.emptyRow}>No products / parts.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {sale.job_order_id ? (
          <section className={styles.tableSection}>
            <div className={styles.sectionTitle}>
              <h2>Services Performed</h2>
              <strong>{peso(servicesTotal)}</strong>
            </div>

            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Mechanic</th>
                  <th className={styles.money}>Service Charge</th>
                </tr>
              </thead>
              <tbody>
                {services.length > 0 ? services.map((service, index) => (
                  <tr key={`${service.service_name}-${index}`}>
                    <td><strong>{service.service_name}</strong></td>
                    <td>{service.mechanic_name ?? sale.mechanic_name ?? "-"}</td>
                    <td className={styles.money}>{peso(Number(service.service_charge))}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} className={styles.emptyRow}>No services recorded.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className={styles.summaryArea}>
          <div className={styles.notice}>
            <h3>Service Acknowledgment</h3>
            <p>
              I acknowledge the products and services listed above and confirm that the
              motorcycle/service transaction was received as indicated on this document.
            </p>
          </div>

          <div className={styles.totalBox}>
            {sale.job_order_id ? (
              <>
                <div><span>Parts</span><strong>{peso(partsTotal)}</strong></div>
                <div><span>Services</span><strong>{peso(servicesTotal)}</strong></div>
              </>
            ) : null}
            <div><span>Subtotal</span><strong>{peso(Number(sale.subtotal))}</strong></div>
            <div><span>Discount</span><strong>- {peso(Number(sale.discount_amount))}</strong></div>
            <div className={styles.grandTotal}><span>GRAND TOTAL</span><strong>{peso(Number(sale.total_amount))}</strong></div>
            <div><span>Amount Paid</span><strong>{peso(Number(sale.amount_tendered))}</strong></div>
            <div><span>Change</span><strong>{peso(Number(sale.change_amount))}</strong></div>
          </div>
        </section>

        <section className={styles.signatures}>
          <div>
            <span>Customer Signature</span>
            <strong>{sale.client_name ?? "Walk-in Customer"}</strong>
          </div>
          {sale.job_order_id ? (
            <div>
              <span>Mechanic Signature</span>
              <strong>{sale.mechanic_name ?? "Mechanic"}</strong>
            </div>
          ) : null}
          <div>
            <span>Cashier Signature</span>
            <strong>{sale.cashier_name ?? "Cashier"}</strong>
          </div>
        </section>

        <footer className={styles.footer}>
          <strong>Thank you for choosing KL Motor Shop.</strong>
          <span>Keep this document for your service and purchase record.</span>
        </footer>
      </article>
    </main>
  );
}
