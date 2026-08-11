import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  PackageSearch,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./inventory-dashboard.module.css";

interface Summary extends RowDataPacket{
  total_products:number;low_stock:number;out_stock:number;cost_value:number;retail_value:number;
}
interface POCount extends RowDataPacket{pending_po:number}
interface ReceivedToday extends RowDataPacket{deliveries:number;qty:number}
interface ProductRow extends RowDataPacket{id:number;product_code:string;product_name:string;quantity_on_hand:number;reorder_level:number;selling_price:number}
interface FastRow extends RowDataPacket{product_id:number;product_name:string;qty_sold:number;sales:number}
function money(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}

export default async function InventoryDashboardPage(){
  const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/dashboard");

  const [[summaryRows],[poRows],[todayRows],[lowRows],[fastRows],[slowRows]] = await Promise.all([
    pool.query<Summary[]>(`SELECT COUNT(*) total_products,SUM(quantity_on_hand>0 AND quantity_on_hand<=reorder_level) low_stock,SUM(quantity_on_hand<=0) out_stock,COALESCE(SUM(quantity_on_hand*cost_price),0) cost_value,COALESCE(SUM(quantity_on_hand*selling_price),0) retail_value FROM products WHERE is_active=1`),
    pool.query<POCount[]>(`SELECT COUNT(*) pending_po FROM purchase_orders WHERE status IN ('ORDERED','PARTIALLY_RECEIVED')`),
    pool.query<ReceivedToday[]>(`SELECT COUNT(DISTINCT st.id) deliveries,COALESCE(SUM(sti.quantity),0) qty FROM stock_transactions st JOIN stock_transaction_items sti ON sti.stock_transaction_id=st.id WHERE st.transaction_type='STOCK_IN' AND DATE(st.transaction_date)=CURDATE()`),
    pool.query<ProductRow[]>(`SELECT id,product_code,product_name,quantity_on_hand,reorder_level,selling_price FROM products WHERE is_active=1 AND quantity_on_hand<=reorder_level ORDER BY CASE WHEN quantity_on_hand<=0 THEN 0 ELSE 1 END,(reorder_level-quantity_on_hand) DESC,product_name LIMIT 15`),
    pool.query<FastRow[]>(`SELECT si.product_id,si.product_name,SUM(si.quantity) qty_sold,SUM(si.line_total) sales FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='COMPLETED' AND s.sale_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) GROUP BY si.product_id,si.product_name ORDER BY qty_sold DESC LIMIT 10`),
    pool.query<FastRow[]>(`SELECT p.id product_id,p.product_name,COALESCE(SUM(CASE WHEN s.sale_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) AND s.status='COMPLETED' THEN si.quantity ELSE 0 END),0) qty_sold,COALESCE(SUM(CASE WHEN s.sale_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) AND s.status='COMPLETED' THEN si.line_total ELSE 0 END),0) sales FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id WHERE p.is_active=1 GROUP BY p.id,p.product_name ORDER BY qty_sold ASC,p.product_name LIMIT 10`)
  ]);

  const s=summaryRows[0]??{total_products:0,low_stock:0,out_stock:0,cost_value:0,retail_value:0};
  const po=poRows[0]?.pending_po??0;
  const today=todayRows[0]??{deliveries:0,qty:0};

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/dashboard"><ArrowLeft size={17}/>Dashboard</Link><Link href="/purchasing"><ShoppingCart size={17}/>Purchasing</Link></div>
    <section className={styles.hero}><div><span>Inventory</span><h1>Inventory Dashboard</h1><p>Stock health, purchasing activity, deliveries, valuation, and product movement.</p></div><Boxes size={46}/></section>
    <section className={styles.metrics}>
      <article><Boxes/><span>Products</span><strong>{s.total_products}</strong></article>
      <article><PackageSearch/><span>Low Stock</span><strong>{s.low_stock}</strong></article>
      <article><PackageSearch/><span>Out of Stock</span><strong>{s.out_stock}</strong></article>
      <article><Truck/><span>Pending POs</span><strong>{po}</strong></article>
      <article><PackageCheck/><span>Deliveries Today</span><strong>{today.deliveries}</strong></article>
      <article><CircleDollarSign/><span>Inventory Cost</span><strong>{money(s.cost_value)}</strong></article>
    </section>

    <section className={styles.grid2}>
      <article className={styles.card}>
        <header><div><span>Action Required</span><h2>Needs Reorder</h2></div><Link href="/purchasing/reorder">View All</Link></header>
        <div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>On Hand</th><th>Reorder</th><th>Status</th></tr></thead><tbody>{lowRows.map(r=><tr key={r.id}><td><strong>{r.product_name}</strong><small>{r.product_code}</small></td><td>{Number(r.quantity_on_hand).toFixed(2)}</td><td>{Number(r.reorder_level).toFixed(2)}</td><td><span className={Number(r.quantity_on_hand)<=0?styles.out:styles.low}>{Number(r.quantity_on_hand)<=0?"OUT":"LOW"}</span></td></tr>)}</tbody></table></div>
      </article>

      <article className={styles.card}>
        <header><div><span>Purchasing</span><h2>Today's Receiving</h2></div></header>
        <div className={styles.receivingBig}><PackageCheck size={36}/><strong>{Number(today.qty).toFixed(2)}</strong><span>items received today</span></div>
        <div className={styles.valueRow}><span>Cost Valuation</span><strong>{money(s.cost_value)}</strong></div>
        <div className={styles.valueRow}><span>Retail Valuation</span><strong>{money(s.retail_value)}</strong></div>
        <div className={styles.valueRow}><span>Potential Margin</span><strong>{money(Number(s.retail_value)-Number(s.cost_value))}</strong></div>
      </article>
    </section>

    <section className={styles.grid2}>
      <article className={styles.card}>
        <header><div><span>Last 30 Days</span><h2>Fast Moving Products</h2></div><TrendingUp size={20}/></header>
        <div className={styles.rankList}>{fastRows.map((r,i)=><div key={r.product_id}><span>{i+1}</span><div><strong>{r.product_name}</strong><small>{Number(r.qty_sold).toFixed(2)} sold</small></div><strong>{money(r.sales)}</strong></div>)}</div>
      </article>
      <article className={styles.card}>
        <header><div><span>Last 30 Days</span><h2>Slow Moving Products</h2></div><TrendingDown size={20}/></header>
        <div className={styles.rankList}>{slowRows.map((r,i)=><div key={r.product_id}><span>{i+1}</span><div><strong>{r.product_name}</strong><small>{Number(r.qty_sold).toFixed(2)} sold</small></div><strong>{money(r.sales)}</strong></div>)}</div>
      </article>
    </section>
  </main>
}
