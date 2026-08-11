import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./purchase-orders.module.css";

interface Row extends RowDataPacket {
  id:number;po_number:string;order_date:Date|string;expected_date:Date|string|null;status:string;total_amount:number;supplier_name:string;created_by_name:string|null;
}
type Params={status?:string;q?:string;success?:string};

export default async function PurchaseOrdersPage({searchParams}:{searchParams:Promise<Params>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/dashboard");
 const p=await searchParams,status=(p.status??"").trim(),q=(p.q??"").trim(),like=`%${q}%`;
 const [rows]=await pool.execute<Row[]>(`
 SELECT po.id,po.po_number,po.order_date,po.expected_date,po.status,po.total_amount,s.supplier_name,u.full_name created_by_name
 FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN users u ON u.id=po.created_by
 WHERE (?='' OR po.status=?)
   AND (?='' OR CONVERT(po.po_number USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(s.supplier_name USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
 ORDER BY po.order_date DESC,po.id DESC`,[status,status,q,like,like]);
 const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));
 return <main className={styles.page}>
 <div className={styles.topbar}><Link href="/purchasing"><ArrowLeft size={17}/>Purchasing</Link><Link href="/purchasing/purchase-orders/new" className={styles.primary}><Plus size={17}/>New Purchase Order</Link></div>
 {p.success?<div className={styles.success}>{p.success}</div>:null}
 <form className={styles.filters}><input name="q" defaultValue={q} placeholder="PO number or supplier..."/><select name="status" defaultValue={status}><option value="">All statuses</option>{["DRAFT","ORDERED","PARTIALLY_RECEIVED","RECEIVED","CANCELLED"].map(x=><option key={x}>{x}</option>)}</select><button>Apply</button></form>
 <section className={styles.card}><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>PO Number</th><th>Supplier</th><th>Expected</th><th>Status</th><th>Created By</th><th>Total</th><th/></tr></thead><tbody>
 {rows.map(r=><tr key={r.id}><td>{new Date(r.order_date).toLocaleString("en-PH")}</td><td><strong>{r.po_number}</strong></td><td>{r.supplier_name}</td><td>{r.expected_date?new Date(r.expected_date).toLocaleDateString("en-PH"):"—"}</td><td>{r.status.replaceAll("_"," ")}</td><td>{r.created_by_name??"—"}</td><td><strong>{money(r.total_amount)}</strong></td><td><Link href={`/purchasing/purchase-orders/${r.id}`}>Open</Link></td></tr>)}
 {!rows.length?<tr><td colSpan={8} className={styles.empty}>No purchase orders found.</td></tr>:null}
 </tbody></table></div></section></main>
}
