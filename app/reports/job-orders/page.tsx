
import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Bike, ClipboardList, Clock3, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./report.module.css";
interface Row extends RowDataPacket {id:number;job_order_number:string;date_received:Date|string;status:string;priority:string;client_name:string|null;plate_number:string|null;model_name:string|null;mechanic_name:string|null;parts_total:number;services_total:number;}
type Params={from?:string;to?:string;status?:string;q?:string};
function php(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}
function dt(v:Date|string){return new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}
function iso(v:string|undefined,f:string){return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:f;}

export default async function JobOrderReport({searchParams}:{searchParams:Promise<Params>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","CASHIER"].includes(user.role))redirect("/reports");
 const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),pad=(n:number)=>String(n).padStart(2,"0"),ds=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const p=await searchParams,from=iso(p.from,ds(first)),to=iso(p.to,ds(now)),status=(p.status??"").trim(),q=(p.q??"").trim(),like=`%${q}%`;
 const [rows]=await pool.execute<Row[]>(`
 SELECT jo.id,jo.job_order_number,jo.date_received,jo.status,jo.priority,c.client_name,m.plate_number,mm.model_name,mech.full_name mechanic_name,
 COALESCE((SELECT SUM(jp.line_total) FROM job_order_parts jp WHERE jp.job_order_id=jo.id),0) parts_total,
 COALESCE((SELECT SUM(js.service_charge) FROM job_order_services js WHERE js.job_order_id=jo.id AND js.status<>'CANCELLED'),0) services_total
 FROM job_orders jo
 LEFT JOIN clients c ON c.id=jo.client_id LEFT JOIN motorcycles m ON m.id=jo.motorcycle_id LEFT JOIN motorcycle_models mm ON mm.id=m.model_id LEFT JOIN mechanics mech ON mech.id=jo.assigned_mechanic_id
 WHERE jo.date_received>=? AND jo.date_received<DATE_ADD(?,INTERVAL 1 DAY)
 AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CONVERT(jo.status USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
 AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CONVERT(jo.job_order_number USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(COALESCE(c.client_name,'') USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(COALESCE(m.plate_number,'') USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
 ORDER BY jo.date_received DESC,jo.id DESC`,[from,to,status,status,q,like,like,like]);
 const ready=rows.filter(r=>r.status==="READY_FOR_PAYMENT").length,completed=rows.filter(r=>["PAID","COMPLETED","RELEASED"].includes(r.status)).length,cancelled=rows.filter(r=>r.status==="CANCELLED").length,value=rows.reduce((a,r)=>a+Number(r.parts_total)+Number(r.services_total),0);
 return <main className={styles.page}><div className={styles.noPrint}><Link href="/reports" className={styles.back}><ArrowLeft size={17}/> Reports</Link></div>
 <section className={styles.reportHeader}><div><div className={styles.eyebrow}>KL Motor Shop</div><h1>Job Order Report</h1><p>{from} to {to}</p></div><div className={styles.headerMeta}><span>Prepared by</span><strong>{user.fullName}</strong><small>{user.role}</small></div></section>
 <form className={`${styles.filters} ${styles.noPrint}`}><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label>Status<select name="status" defaultValue={status}><option value="">All statuses</option>{["RECEIVED","INSPECTION","WAITING_PARTS","REPAIRING","READY_FOR_PAYMENT","PAID","COMPLETED","RELEASED","CANCELLED"].map(v=><option key={v}>{v}</option>)}</select></label><label className={styles.search}>Search<input name="q" defaultValue={q} placeholder="JO, customer, plate..."/></label><button>Apply Filters</button><PrintButton/></form>
 <section className={styles.metrics}><article><ClipboardList/><span>Job Orders</span><strong>{rows.length}</strong></article><article><Clock3/><span>Ready for Payment</span><strong>{ready}</strong></article><article><Wrench/><span>Paid / Completed</span><strong>{completed}</strong></article><article><Bike/><span>Cancelled</span><strong>{cancelled}</strong></article><article><ClipboardList/><span>Job Value</span><strong>{php(value)}</strong></article></section>
 <section className={styles.panel}><header><div><p>Workshop transactions</p><h2>Job Orders</h2></div><span>{rows.length} record(s)</span></header>{rows.length?<div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Job Order</th><th>Customer</th><th>Motorcycle</th><th>Mechanic</th><th>Priority</th><th>Status</th><th className={styles.amount}>Parts</th><th className={styles.amount}>Services</th><th className={styles.amount}>Total</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{dt(r.date_received)}</td><td><strong>{r.job_order_number}</strong></td><td>{r.client_name??"—"}</td><td>{r.model_name??"—"}<small>{r.plate_number??"—"}</small></td><td>{r.mechanic_name??"—"}</td><td>{r.priority}</td><td>{r.status.replaceAll("_"," ")}</td><td className={styles.amount}>{php(r.parts_total)}</td><td className={styles.amount}>{php(r.services_total)}</td><td className={styles.amount}><strong>{php(Number(r.parts_total)+Number(r.services_total))}</strong></td></tr>)}</tbody></table></div>:<p className={styles.empty}>No Job Orders match the filters.</p>}</section>
 <footer className={styles.printFooter}>KL Motor Shop • Job Order Report</footer></main>;
}
