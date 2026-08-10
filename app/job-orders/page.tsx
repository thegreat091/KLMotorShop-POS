import type { RowDataPacket } from "mysql2";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./job-orders.module.css";

interface JobRow extends RowDataPacket { id:number; job_order_number:string; date_received:Date; status:string; priority:string; client_name:string|null; plate_number:string|null; model_name:string|null; mechanic_name:string|null; parts_total:number; services_total:number; }
export default async function JobOrdersPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}) {
 const user=await getCurrentUser(); if(!user) redirect("/"); if(!["ADMIN","CASHIER","OWNER"].includes(user.role)) redirect("/dashboard");
 const p=await searchParams; const q=(p.q??"").trim(); const status=(p.status??"").trim();
 const like=`%${q}%`;
 const [rows]=await pool.execute<JobRow[]>(`
 SELECT jo.id,jo.job_order_number,jo.date_received,jo.status,jo.priority,c.client_name,m.plate_number,mm.model_name,mech.full_name mechanic_name,
 COALESCE((SELECT SUM(line_total) FROM job_order_parts jp WHERE jp.job_order_id=jo.id),0) parts_total,
 COALESCE((SELECT SUM(service_charge) FROM job_order_services js WHERE js.job_order_id=jo.id AND js.status<>'CANCELLED'),0) services_total
 FROM job_orders jo LEFT JOIN clients c ON c.id=jo.client_id LEFT JOIN motorcycles m ON m.id=jo.motorcycle_id LEFT JOIN motorcycle_models mm ON mm.id=m.model_id LEFT JOIN mechanics mech ON mech.id=jo.assigned_mechanic_id
 WHERE (CAST(? AS CHAR CHARACTER SET utf8mb4)=''
   OR jo.job_order_number COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
   OR c.client_name COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
   OR m.plate_number COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
 AND (CAST(? AS CHAR CHARACTER SET utf8mb4)=''
   OR jo.status COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
 ORDER BY jo.date_received DESC,jo.id DESC`,[q,like,like,like,status,status]);
 const statuses=["RECEIVED","INSPECTION","WAITING_PARTS","REPAIRING","READY_FOR_PAYMENT","PAID","COMPLETED","RELEASED","CANCELLED"];
 return <main className={styles.page}>
  <Link href="/dashboard" className={styles.back}><ArrowLeft size={17}/> Dashboard</Link>
  <section className={styles.hero}><div><div className={styles.eyebrow}>Workshop</div><h1>Job Orders</h1><p>Track motorcycles from customer reception through repair, payment, and release.</p></div>{["ADMIN","CASHIER"].includes(user.role)?<Link href="/job-orders/new" className={styles.primary}><Plus size={18}/> New Job Order</Link>:null}</section>
  <form className={styles.toolbar}><input name="q" defaultValue={q} placeholder="Search JO, customer, plate..."/><select name="status" defaultValue={status}><option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className={styles.secondary}>Filter</button></form>
  <div className={styles.tableWrap}>{rows.length===0?<div className={styles.empty}><ClipboardList size={28}/><p>No job orders found.</p></div>:<table className={styles.table}><thead><tr><th>JO Number</th><th>Date</th><th>Customer / Motorcycle</th><th>Mechanic</th><th>Priority</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.job_order_number}</strong></td><td>{new Date(r.date_received).toLocaleString("en-PH")}</td><td><strong>{r.client_name??"Walk-in"}</strong><div className={styles.muted}>{r.plate_number??"—"} {r.model_name?`• ${r.model_name}`:""}</div></td><td>{r.mechanic_name??"Unassigned"}</td><td><span className={styles.priority}>{r.priority}</span></td><td><span className={styles.status}>{r.status.replaceAll("_"," ")}</span></td><td><strong>₱{(Number(r.parts_total)+Number(r.services_total)).toFixed(2)}</strong></td><td><Link className={styles.secondary} href={`/job-orders/${r.id}`}>Open</Link></td></tr>)}</tbody></table>}</div>
 </main>;
}
