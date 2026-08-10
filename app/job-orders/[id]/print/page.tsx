import type { RowDataPacket } from "mysql2";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import AutoPrint from "./AutoPrint";
import Barcode39 from "./Barcode39";
import PrintButton from "./PrintButton";
import styles from "./print.module.css";

interface JobPrintRow extends RowDataPacket {
  id: number;
  job_order_number: string;
  date_received: Date;
  estimated_finish: Date | null;
  status: string;
  priority: string;
  customer_concern: string | null;
  diagnosis: string | null;
  remarks: string | null;
  client_name: string | null;
  mobile_number: string | null;
  plate_number: string | null;
  model_name: string | null;
  mechanic_name: string | null;
  created_by_name: string | null;
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Copy({ job, label }: { job: JobPrintRow; label: string }) {
  return (
    <section className={styles.copy}>
      <header className={styles.header}>
        <div>
          <div className={styles.brandKicker}>Motorcycle Parts &amp; Service</div>
          <div className={styles.shopName}>KL MOTOR SHOP</div>
          <div className={styles.docTitle}>JOB ORDER / SERVICE RECEIVING FORM</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.copyLabel}>{label}</div>
          <div className={styles.row} style={{ marginTop: 5 }}>
            <span className={styles.label}>Job Order</span>
            <span className={styles.value}>{job.job_order_number}</span>
          </div>
          <div className={styles.barcodeBlock}>
            <Barcode39 value={job.job_order_number} />
            <span>{job.job_order_number}</span>
          </div>
        </div>
      </header>

      <div className={styles.meta}>
        <div className={styles.metaBlock}>
          <div className={styles.metaTitle}>Customer / Motorcycle</div>
          <div className={styles.row}><span className={styles.label}>Customer</span><span className={styles.value}>{job.client_name ?? "—"}</span></div>
          <div className={styles.row}><span className={styles.label}>Contact</span><span className={styles.value}>{job.mobile_number ?? "—"}</span></div>
          <div className={styles.row}><span className={styles.label}>Motorcycle</span><span className={styles.value}>{job.model_name ?? "—"}</span></div>
          <div className={styles.row}><span className={styles.label}>Plate No.</span><span className={styles.value}>{job.plate_number ?? "—"}</span></div>
        </div>

        <div className={styles.metaBlock}>
          <div className={styles.metaTitle}>Job Information</div>
          <div className={styles.row}><span className={styles.label}>Received</span><span className={styles.value}>{formatDate(job.date_received)}</span></div>
          <div className={styles.row}><span className={styles.label}>Priority</span><span className={styles.value}>{job.priority}</span></div>
          <div className={styles.row}><span className={styles.label}>Mechanic</span><span className={styles.value}>{job.mechanic_name ?? "Unassigned"}</span></div>
          <div className={styles.row}><span className={styles.label}>Est. Finish</span><span className={styles.value}>{formatDate(job.estimated_finish)}</span></div>
        </div>
      </div>

      <div className={styles.concern}>
        <div className={styles.concernTitle}>Customer Concern / Requested Work</div>
        <div>{job.customer_concern || "—"}</div>
      </div>

      <div className={styles.notesGrid}>
        <div className={styles.blankBox}>
          <div className={styles.blankTitle}>Initial Inspection / Findings</div>
          <div>{job.diagnosis || ""}</div>
        </div>
        <div className={styles.blankBox}>
          <div className={styles.blankTitle}>Remarks / Additional Instructions</div>
          <div>{job.remarks || ""}</div>
        </div>
      </div>

      <div className={styles.signatures}>
        <div className={styles.signature}>Customer Signature</div>
        <div className={styles.signature}>Assigned Mechanic</div>
        <div className={styles.signature}>Received By / Cashier</div>
      </div>

      <div className={styles.footer}>
        <span>Please present the customer copy when claiming the motorcycle.</span>
        <span>Created by: {job.created_by_name ?? "System"}</span>
      </div>
    </section>
  );
}

export default async function JobOrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "CASHIER", "OWNER"].includes(user.role)) redirect("/dashboard");

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) notFound();
  const query = await searchParams;

  const [rows] = await pool.execute<JobPrintRow[]>(`
    SELECT
      jo.id,
      jo.job_order_number,
      jo.date_received,
      jo.estimated_finish,
      jo.status,
      jo.priority,
      jo.customer_concern,
      jo.diagnosis,
      jo.remarks,
      c.client_name,
      c.mobile_number,
      m.plate_number,
      mm.model_name,
      mech.full_name AS mechanic_name,
      creator.full_name AS created_by_name
    FROM job_orders jo
    LEFT JOIN clients c ON c.id = jo.client_id
    LEFT JOIN motorcycles m ON m.id = jo.motorcycle_id
    LEFT JOIN motorcycle_models mm ON mm.id = m.model_id
    LEFT JOIN mechanics mech ON mech.id = jo.assigned_mechanic_id
    LEFT JOIN users creator ON creator.id = jo.created_by
    WHERE jo.id = ?
    LIMIT 1
  `, [jobId]);

  const job = rows[0];
  if (!job) notFound();

  return (
    <>
      <AutoPrint enabled={query.autoprint === "1"} />
      <div className={styles.screenBar}>
        <Link href={`/job-orders/${job.id}`} className={styles.screenButton}>Continue to Job Order</Link>
        <PrintButton />
      </div>
      <main className={styles.sheet}>
        <Copy job={job} label="CUSTOMER COPY" />
        <div className={styles.cutLine}>Cut Here</div>
        <Copy job={job} label="SHOP COPY" />
      </main>
    </>
  );
}
