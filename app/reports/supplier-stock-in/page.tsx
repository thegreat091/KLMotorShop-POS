
import type { RowDataPacket } from "mysql2";
import { ArrowLeft, CircleDollarSign, PackageOpen, Truck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./report.module.css";
interface Row extends RowDataPacket {supplier_id:number;supplier_name:string;transactions:number;quantity:number;purchase_cost:number;last_stock_in:Date|string|null;}
interface Detail extends RowDataPacket {reference_number:string;transaction_date:Date|string;supplier_name:string;product_name:string;quantity:number;unit_cost:number;subtotal:number;}
type Params={from?:string;to?:string;supplier?:string};
function php(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}
function iso(v:string|undefined,f:string){return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:f;}

export default async function SupplierReport({searchParams}:{searchParams:Promise<Params>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/reports");
 const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),pad=(n:number)=>String(n).padStart(2,"0"),ds=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const p=await searchParams,from=iso(p.from,ds(first)),to=iso(p.to,ds(now)),supplier=(p.supplier??"").trim(),args=[from,to,supplier,supplier];
 const [[rows],[details],[suppliers]]=await Promise.all([
 pool.execute<Row[]>(`SELECT COALESCE(s.id,0) supplier_id,COALESCE(s.supplier_name,'No Supplier') supplier_name,COUNT(DISTINCT st.id) transactions,SUM(sti.quantity) quantity,SUM(sti.subtotal) purchase_cost,MAX(st.transaction_date) last_stock_in FROM stock_transactions st JOIN stock_transaction_items sti ON sti.stock_transaction_id=st.id LEFT JOIN suppliers s ON s.id=st.supplier_id WHERE st.transaction_type='STOCK_IN' AND st.transaction_date>=? AND st.transaction_date<DATE_ADD(?,INTERVAL 1 DAY) AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CAST(COALESCE(s.id,0) AS CHAR)=?) GROUP BY s.id,s.supplier_name ORDER BY purchase_cost DESC`,args),
 pool.execute<Detail[]>(`SELECT st.reference_number,st.transaction_date,COALESCE(s.supplier_name,'No Supplier') supplier_name,p.product_name,sti.quantity,sti.unit_cost,sti.subtotal FROM stock_transactions st JOIN stock_transaction_items sti ON sti.stock_transaction_id=st.id JOIN products p ON p.id=sti.product_id LEFT JOIN suppliers s ON s.id=st.supplier_id WHERE st.transaction_type='STOCK_IN' AND st.transaction_date>=? AND st.transaction_date<DATE_ADD(?,INTERVAL 1 DAY) AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR CAST(COALESCE(s.id,0) AS CHAR)=?) ORDER BY st.transaction_date DESC,st.id DESC LIMIT 500`,args),
 pool.query<any[]>("SELECT id,supplier_name FROM suppliers WHERE is_active=1 ORDER BY supplier_name")
 ]);
 const totalQty=rows.reduce((a,r)=>a+Number(r.quantity),0),totalCost=rows.reduce((a,r)=>a+Number(r.purchase_cost),0),tx=rows.reduce((a,r)=>a+Number(r.transactions),0);
 return <main className={styles.page}><div className={styles.noPrint}><Link href="/reports" className={styles.back}><ArrowLeft size={17}/> Reports</Link></div>
 <section className={styles.reportHeader}><div><div className={styles.eyebrow}>KL Motor Shop</div><h1>Supplier / Stock-In Report</h1><p>{from} to {to}</p></div><div className={styles.headerMeta}><span>Prepared by</span><strong>{user.fullName}</strong><small>{user.role}</small></div></section>
 <form className={`${styles.filters} ${styles.noPrint}`}><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label>Supplier<select name="supplier" defaultValue={supplier}><option value="">All suppliers</option>{suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></label><button>Apply Filters</button><PrintButton/></form>
 <section className={styles.metrics}><article><Truck/><span>Suppliers</span><strong>{rows.length}</strong></article><article><PackageOpen/><span>Stock-In Transactions</span><strong>{tx}</strong></article><article><PackageOpen/><span>Quantity Received</span><strong>{totalQty.toFixed(2)}</strong></article><article><CircleDollarSign/><span>Purchase Cost</span><strong>{php(totalCost)}</strong></article></section>
 <section className={styles.panel}><header><div><p>Supplier summary</p><h2>Purchases by Supplier</h2></div></header><div className={styles.tableWrap}><table><thead><tr><th>Supplier</th><th>Transactions</th><th>Qty</th><th className={styles.amount}>Purchase Cost</th><th>Last Stock In</th></tr></thead><tbody>{rows.map(r=><tr key={r.supplier_id}><td><strong>{r.supplier_name}</strong></td><td>{r.transactions}</td><td>{Number(r.quantity).toFixed(2)}</td><td className={styles.amount}>{php(r.purchase_cost)}</td><td>{r.last_stock_in?new Date(r.last_stock_in).toLocaleString("en-PH"):"—"}</td></tr>)}</tbody></table></div></section>
 <section className={styles.panel}><header><div><p>Stock-In details</p><h2>Received Products</h2></div></header><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Reference</th><th>Supplier</th><th>Product</th><th>Qty</th><th className={styles.amount}>Unit Cost</th><th className={styles.amount}>Subtotal</th></tr></thead><tbody>{details.map((r,i)=><tr key={i}><td>{new Date(r.transaction_date).toLocaleString("en-PH")}</td><td>{r.reference_number}</td><td>{r.supplier_name}</td><td>{r.product_name}</td><td>{Number(r.quantity).toFixed(2)}</td><td className={styles.amount}>{php(r.unit_cost)}</td><td className={styles.amount}>{php(r.subtotal)}</td></tr>)}</tbody></table></div></section>
 <footer className={styles.printFooter}>KL Motor Shop • Supplier / Stock-In Report</footer></main>;
}
