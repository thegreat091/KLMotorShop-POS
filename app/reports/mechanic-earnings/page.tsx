
import type { RowDataPacket } from "mysql2";
import { ArrowLeft, CircleDollarSign, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./report.module.css";
interface Row extends RowDataPacket {mechanic_id:number;mechanic_name:string;jobs:number;services:number;service_amount:number;mechanic_share:number;owner_share:number;unpaid:number;paid:number;}
interface Detail extends RowDataPacket {earning_date:Date|string;mechanic_name:string;job_order_number:string|null;service_name:string|null;service_amount:number;mechanic_share:number;payout_status:string;}
type Params={from?:string;to?:string;mechanic?:string};
function php(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}
function iso(v:string|undefined,f:string){return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:f;}

export default async function MechanicEarningsReport({searchParams}:{searchParams:Promise<Params>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER"].includes(user.role))redirect("/reports");
 const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),pad=(n:number)=>String(n).padStart(2,"0"),ds=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const p=await searchParams,from=iso(p.from,ds(first)),to=iso(p.to,ds(now)),mechanic=(p.mechanic??"").trim(),args=[from,to,mechanic,mechanic];
 const [[rows],[details],[mechanics]]=await Promise.all([
 pool.execute<Row[]>(`SELECT me.mechanic_id,m.full_name mechanic_name,COUNT(DISTINCT me.job_order_id) jobs,COUNT(*) services,SUM(me.service_amount) service_amount,SUM(me.mechanic_share) mechanic_share,SUM(me.service_amount-me.mechanic_share) owner_share,SUM(CASE WHEN me.payout_status='UNPAID' THEN me.mechanic_share ELSE 0 END) unpaid,SUM(CASE WHEN me.payout_status='PAID' THEN me.mechanic_share ELSE 0 END) paid FROM mechanic_earnings me JOIN mechanics m ON m.id=me.mechanic_id WHERE me.earning_date>=? AND me.earning_date<DATE_ADD(?,INTERVAL 1 DAY) AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CAST(me.mechanic_id AS CHAR)=?) GROUP BY me.mechanic_id,m.full_name ORDER BY mechanic_share DESC`,args),
 pool.execute<Detail[]>(`SELECT me.earning_date,m.full_name mechanic_name,jo.job_order_number,s.service_name,me.service_amount,me.mechanic_share,me.payout_status FROM mechanic_earnings me JOIN mechanics m ON m.id=me.mechanic_id LEFT JOIN job_orders jo ON jo.id=me.job_order_id LEFT JOIN services s ON s.id=me.service_id WHERE me.earning_date>=? AND me.earning_date<DATE_ADD(?,INTERVAL 1 DAY) AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CAST(me.mechanic_id AS CHAR)=?) ORDER BY me.earning_date DESC LIMIT 500`,args),
 pool.query<any[]>("SELECT id,full_name FROM mechanics WHERE is_active=1 ORDER BY full_name")
 ]);
 const sum=rows.reduce((a,r)=>({jobs:a.jobs+Number(r.jobs),service:a.service+Number(r.service_amount),mechanic:a.mechanic+Number(r.mechanic_share),owner:a.owner+Number(r.owner_share),unpaid:a.unpaid+Number(r.unpaid)}),{jobs:0,service:0,mechanic:0,owner:0,unpaid:0});
 return <main className={styles.page}><div className={styles.noPrint}><Link href="/reports" className={styles.back}><ArrowLeft size={17}/> Reports</Link></div>
 <section className={styles.reportHeader}><div><div className={styles.eyebrow}>KL Motor Shop</div><h1>Mechanic Earnings Report</h1><p>{from} to {to}</p></div><div className={styles.headerMeta}><span>Prepared by</span><strong>{user.fullName}</strong><small>{user.role}</small></div></section>
 <form className={`${styles.filters} ${styles.noPrint}`}><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label>Mechanic<select name="mechanic" defaultValue={mechanic}><option value="">All mechanics</option>{mechanics.map((m:any)=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label><button>Apply Filters</button><PrintButton/></form>
 <section className={styles.metrics}><article><UserRound/><span>Mechanics</span><strong>{rows.length}</strong></article><article><Wrench/><span>Jobs</span><strong>{sum.jobs}</strong></article><article><CircleDollarSign/><span>Service Amount</span><strong>{php(sum.service)}</strong></article><article><CircleDollarSign/><span>Mechanic Share</span><strong>{php(sum.mechanic)}</strong></article><article><CircleDollarSign/><span>Owner Share</span><strong>{php(sum.owner)}</strong></article><article><CircleDollarSign/><span>Unpaid Earnings</span><strong>{php(sum.unpaid)}</strong></article></section>
 <section className={styles.panel}><header><div><p>Mechanic summary</p><h2>Earnings by Mechanic</h2></div></header><div className={styles.tableWrap}><table><thead><tr><th>Mechanic</th><th>Jobs</th><th>Services</th><th className={styles.amount}>Service Amount</th><th className={styles.amount}>Mechanic Share</th><th className={styles.amount}>Owner Share</th><th className={styles.amount}>Unpaid</th><th className={styles.amount}>Paid</th></tr></thead><tbody>{rows.map(r=><tr key={r.mechanic_id}><td><strong>{r.mechanic_name}</strong></td><td>{r.jobs}</td><td>{r.services}</td><td className={styles.amount}>{php(r.service_amount)}</td><td className={styles.amount}>{php(r.mechanic_share)}</td><td className={styles.amount}>{php(r.owner_share)}</td><td className={styles.amount}>{php(r.unpaid)}</td><td className={styles.amount}>{php(r.paid)}</td></tr>)}</tbody></table></div></section>
 <section className={styles.panel}><header><div><p>Earning details</p><h2>Service Earnings</h2></div></header><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Mechanic</th><th>Job Order</th><th>Service</th><th className={styles.amount}>Service Amount</th><th className={styles.amount}>Mechanic Share</th><th>Status</th></tr></thead><tbody>{details.map((r,i)=><tr key={i}><td>{new Date(r.earning_date).toLocaleString("en-PH")}</td><td>{r.mechanic_name}</td><td>{r.job_order_number??"—"}</td><td>{r.service_name??"—"}</td><td className={styles.amount}>{php(r.service_amount)}</td><td className={styles.amount}>{php(r.mechanic_share)}</td><td>{r.payout_status}</td></tr>)}</tbody></table></div></section>
 <footer className={styles.printFooter}>KL Motor Shop • Mechanic Earnings Report</footer></main>;
}
