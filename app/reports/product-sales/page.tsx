
import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Boxes, CircleDollarSign, PackageCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./report.module.css";

interface Row extends RowDataPacket {
  product_id:number; product_code:string; product_name:string; category_name:string|null; brand_name:string|null;
  quantity:number; sales:number; cost:number; gross_profit:number; transactions:number;
}
type Params={from?:string;to?:string;q?:string};
function php(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}
function iso(v:string|undefined,f:string){return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:f;}

export default async function ProductSalesReport({searchParams}:{searchParams:Promise<Params>}){
  const user=await getCurrentUser(); if(!user) redirect("/"); if(!["ADMIN","OWNER","CASHIER"].includes(user.role)) redirect("/reports");
  const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1), pad=(n:number)=>String(n).padStart(2,"0");
  const ds=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const p=await searchParams, from=iso(p.from,ds(first)), to=iso(p.to,ds(now)), q=(p.q??"").trim(), like=`%${q}%`;

  const [rows]=await pool.execute<Row[]>(`
    SELECT si.product_id,si.product_code,si.product_name,pc.category_name,pb.brand_name,
           SUM(si.quantity) quantity,SUM(si.line_total) sales,
           SUM(COALESCE(sb.cost,0)) cost,
           SUM(si.line_total)-SUM(COALESCE(sb.cost,0)) gross_profit,
           COUNT(DISTINCT s.id) transactions
    FROM sales s
    JOIN sale_items si ON si.sale_id=s.id
    LEFT JOIN products p ON p.id=si.product_id
    LEFT JOIN product_categories pc ON pc.id=p.category_id
    LEFT JOIN product_brands pb ON pb.id=p.brand_id
    LEFT JOIN (
      SELECT sale_item_id,SUM(quantity*unit_cost) cost
      FROM sale_item_batches GROUP BY sale_item_id
    ) sb ON sb.sale_item_id=si.id
    WHERE s.status='COMPLETED'
      AND s.sale_date>=? AND s.sale_date<DATE_ADD(?,INTERVAL 1 DAY)
      AND (
        CAST(? AS CHAR CHARACTER SET utf8mb4)=''
        OR CONVERT(si.product_name USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR CONVERT(COALESCE(si.product_code,'') USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      )
    GROUP BY si.product_id,si.product_code,si.product_name,pc.category_name,pb.brand_name
    ORDER BY sales DESC,quantity DESC
  `,[from,to,q,like,like]);

  const summary=rows.reduce((a,r)=>({products:a.products+1,quantity:a.quantity+Number(r.quantity),sales:a.sales+Number(r.sales),cost:a.cost+Number(r.cost),gross_profit:a.gross_profit+Number(r.gross_profit)}),{products:0,quantity:0,sales:0,cost:0,gross_profit:0});

  return <main className={styles.page}>
    <div className={styles.noPrint}><Link href="/reports" className={styles.back}><ArrowLeft size={17}/> Reports</Link></div>
    <section className={styles.reportHeader}><div><div className={styles.eyebrow}>KL Motor Shop</div><h1>Product Sales Report</h1><p>{from} to {to}</p></div><div className={styles.headerMeta}><span>Prepared by</span><strong>{user.fullName}</strong><small>{user.role}</small></div></section>
    <form className={`${styles.filters} ${styles.noPrint}`}><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label className={styles.search}>Search<input name="q" defaultValue={q} placeholder="Product or code..."/></label><button>Apply Filters</button><PrintButton/></form>
    <section className={styles.metrics}>
      <article><Boxes/><span>Products Sold</span><strong>{summary.products}</strong></article>
      <article><PackageCheck/><span>Total Quantity</span><strong>{summary.quantity.toFixed(2)}</strong></article>
      <article><CircleDollarSign/><span>Product Sales</span><strong>{php(summary.sales)}</strong></article>
      <article><CircleDollarSign/><span>Estimated Cost</span><strong>{php(summary.cost)}</strong></article>
      <article><TrendingUp/><span>Est. Gross Profit</span><strong>{php(summary.gross_profit)}</strong></article>
    </section>
    <section className={styles.panel}><header><div><p>Product performance</p><h2>Products Sold</h2></div><span>{rows.length} product(s)</span></header>
      {rows.length?<div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Category</th><th>Brand</th><th>Transactions</th><th>Qty</th><th className={styles.amount}>Sales</th><th className={styles.amount}>Cost</th><th className={styles.amount}>Gross Profit</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.product_id}><td><strong>{r.product_name}</strong><small>{r.product_code}</small></td><td>{r.category_name??"—"}</td><td>{r.brand_name??"—"}</td><td>{r.transactions}</td><td>{Number(r.quantity).toFixed(2)}</td><td className={styles.amount}>{php(r.sales)}</td><td className={styles.amount}>{php(r.cost)}</td><td className={styles.amount}><strong>{php(r.gross_profit)}</strong></td></tr>)}
      </tbody></table></div>:<p className={styles.empty}>No product sales in this range.</p>}
    </section>
    <footer className={styles.printFooter}>KL Motor Shop • Product Sales Report</footer>
  </main>;
}
