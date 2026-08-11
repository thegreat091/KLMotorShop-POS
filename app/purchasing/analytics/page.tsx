import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  Timer,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./analytics.module.css";

interface Summary extends RowDataPacket {
  total_pos:number;
  ordered:number;
  partial:number;
  received:number;
  total_value:number;
}
interface SupplierRow extends RowDataPacket {
  supplier_id:number;
  supplier_name:string;
  po_count:number;
  total_value:number;
  received_qty:number;
  pending_po:number;
}
interface RecentRow extends RowDataPacket {
  id:number;po_number:string;supplier_name:string;order_date:Date|string;status:string;total_amount:number;ordered_qty:number;received_qty:number;
}
function money(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}

export default async function PurchasingAnalyticsPage(){
  const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/dashboard");

  const [summaryRows]=await pool.query<Summary[]>(`
    SELECT
      COUNT(*) total_pos,
      SUM(status='ORDERED') ordered,
      SUM(status='PARTIALLY_RECEIVED') partial,
      SUM(status='RECEIVED') received,
      COALESCE(SUM(CASE WHEN status<>'CANCELLED' THEN total_amount ELSE 0 END),0) total_value
    FROM purchase_orders
  `);
  const summary=summaryRows[0]??{total_pos:0,ordered:0,partial:0,received:0,total_value:0};

  const [suppliers]=await pool.query<SupplierRow[]>(`
    SELECT
      s.id AS supplier_id,
      s.supplier_name,
      COALESCE(po_summary.po_count, 0) AS po_count,
      COALESCE(po_summary.total_value, 0) AS total_value,
      COALESCE(receive_summary.received_qty, 0) AS received_qty,
      COALESCE(po_summary.pending_po, 0) AS pending_po
    FROM suppliers s
    LEFT JOIN (
      SELECT
        supplier_id,
        COUNT(*) AS po_count,
        SUM(CASE WHEN status <> 'CANCELLED' THEN total_amount ELSE 0 END) AS total_value,
        SUM(CASE WHEN status IN ('ORDERED','PARTIALLY_RECEIVED') THEN 1 ELSE 0 END) AS pending_po
      FROM purchase_orders
      GROUP BY supplier_id
    ) po_summary ON po_summary.supplier_id = s.id
    LEFT JOIN (
      SELECT
        po.supplier_id,
        SUM(poi.quantity_received) AS received_qty
      FROM purchase_orders po
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.status <> 'CANCELLED'
      GROUP BY po.supplier_id
    ) receive_summary ON receive_summary.supplier_id = s.id
    WHERE s.is_active = 1
      AND COALESCE(po_summary.po_count, 0) > 0
    ORDER BY total_value DESC
    LIMIT 25
  `);

  const [recent]=await pool.query<RecentRow[]>(`
    SELECT
      po.id,po.po_number,s.supplier_name,po.order_date,po.status,po.total_amount,
      COALESCE(SUM(poi.quantity_ordered),0) ordered_qty,
      COALESCE(SUM(poi.quantity_received),0) received_qty
    FROM purchase_orders po
    JOIN suppliers s ON s.id=po.supplier_id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
    GROUP BY po.id,po.po_number,s.supplier_name,po.order_date,po.status,po.total_amount
    ORDER BY po.order_date DESC,po.id DESC
    LIMIT 25
  `);

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/purchasing"><ArrowLeft size={17}/>Purchasing</Link></div>
    <section className={styles.hero}><div><span>Purchasing</span><h1>Purchase Analytics</h1><p>Supplier activity, purchase value, pending orders, and receiving progress.</p></div><ClipboardList size={46}/></section>
    <section className={styles.metrics}>
      <article><ClipboardList/><span>Total POs</span><strong>{summary.total_pos}</strong></article>
      <article><Truck/><span>Ordered</span><strong>{summary.ordered}</strong></article>
      <article><Timer/><span>Partial</span><strong>{summary.partial}</strong></article>
      <article><PackageCheck/><span>Received</span><strong>{summary.received}</strong></article>
      <article><CircleDollarSign/><span>PO Value</span><strong>{money(summary.total_value)}</strong></article>
    </section>
    <section className={styles.card}><header><div><span>Supplier Performance</span><h2>Purchasing by Supplier</h2></div></header>
      <div className={styles.tableWrap}><table><thead><tr><th>Supplier</th><th>POs</th><th>Pending</th><th>Qty Received</th><th>Total PO Value</th><th/></tr></thead><tbody>
      {suppliers.map(r=><tr key={r.supplier_id}><td><strong>{r.supplier_name}</strong></td><td>{r.po_count}</td><td>{r.pending_po}</td><td>{Number(r.received_qty).toFixed(2)}</td><td>{money(r.total_value)}</td><td><Link href={`/suppliers/${r.supplier_id}`}>Profile</Link></td></tr>)}
      </tbody></table></div>
    </section>
    <section className={styles.card}><header><div><span>Recent Orders</span><h2>Receiving Progress</h2></div></header>
      <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>PO</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Received</th><th>Progress</th><th>Total</th></tr></thead><tbody>
      {recent.map(r=>{const pct=Number(r.ordered_qty)>0?Math.min(100,(Number(r.received_qty)/Number(r.ordered_qty))*100):0;return <tr key={r.id}><td>{new Date(r.order_date).toLocaleDateString("en-PH")}</td><td><Link href={`/purchasing/purchase-orders/${r.id}`}>{r.po_number}</Link></td><td>{r.supplier_name}</td><td>{r.status.replaceAll("_"," ")}</td><td>{Number(r.ordered_qty).toFixed(2)}</td><td>{Number(r.received_qty).toFixed(2)}</td><td><div className={styles.progress}><span style={{width:`${pct}%`}}/></div><small>{pct.toFixed(0)}%</small></td><td>{money(r.total_amount)}</td></tr>})}
      </tbody></table></div>
    </section>
  </main>
}
