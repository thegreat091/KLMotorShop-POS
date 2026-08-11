import type { RowDataPacket } from "mysql2";
import { ArrowLeft, BarChart3, CalendarDays, CreditCard, PackageCheck, ReceiptText, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./sales-report.module.css";

interface SummaryRow extends RowDataPacket {
  transactions: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  amount_tendered: number;
}
interface ProductSummaryRow extends RowDataPacket { product_name:string; quantity:number; amount:number; estimated_cost:number; }
interface ServiceSummaryRow extends RowDataPacket { service_name:string; jobs:number; amount:number; owner_share:number; mechanic_share:number; }
interface PaymentRow extends RowDataPacket { payment_method:string; transactions:number; amount:number; }
interface SaleRow extends RowDataPacket {
  id:number; sale_number:string; sale_date:Date|string; client_name:string|null; plate_number:string|null;
  job_order_number:string|null; cashier_name:string|null; payment_method:string; status:string;
  subtotal:number; discount_amount:number; total_amount:number;
}

type SearchParams = { from?:string; to?:string; payment?:string; status?:string; q?:string };

function isoDate(value:string|undefined, fallback:string){ return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback; }
function php(value:number){ return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2}).format(Number(value||0)); }
function dateTime(value:Date|string){ return new Intl.DateTimeFormat("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)); }

export default async function SalesReportPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const user=await getCurrentUser();
  if(!user) redirect("/");
  if(!["ADMIN","OWNER","CASHIER"].includes(user.role)) redirect("/reports");

  const today=new Date();
  const first=new Date(today.getFullYear(),today.getMonth(),1);
  const pad=(n:number)=>String(n).padStart(2,"0");
  const local=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const params=await searchParams;
  const from=isoDate(params.from,local(first));
  const to=isoDate(params.to,local(today));
  const payment=(params.payment??"").trim();
  const status=(params.status??"COMPLETED").trim();
  const q=(params.q??"").trim();
  const like=`%${q}%`;

  const baseWhere=`s.sale_date >= ? AND s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)
    AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR s.payment_method COLLATE utf8mb4_unicode_ci=CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
    AND (CAST(? AS CHAR CHARACTER SET utf8mb4)='' OR s.status COLLATE utf8mb4_unicode_ci=CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)`;
  const baseArgs=[from,to,payment,payment,status,status];

  const [[summaryRows],[products],[services],[payments],[sales]] = await Promise.all([
    pool.execute<SummaryRow[]>(`
      SELECT COUNT(*) transactions,
             COALESCE(SUM(subtotal),0) gross_sales,
             COALESCE(SUM(discount_amount),0) discounts,
             COALESCE(SUM(total_amount),0) net_sales,
             COALESCE(SUM(amount_tendered),0) amount_tendered
      FROM sales s WHERE ${baseWhere}`, baseArgs),
    pool.execute<ProductSummaryRow[]>(`
      SELECT si.product_name, COALESCE(SUM(si.quantity),0) quantity,
             COALESCE(SUM(si.line_total),0) amount,
             COALESCE(SUM(COALESCE(cost.estimated_cost,0)),0) estimated_cost
      FROM sales s
      JOIN sale_items si ON si.sale_id=s.id
      LEFT JOIN (
        SELECT sale_item_id, SUM(unit_cost*quantity) estimated_cost
        FROM sale_item_batches
        GROUP BY sale_item_id
      ) cost ON cost.sale_item_id=si.id
      WHERE ${baseWhere}
      GROUP BY si.product_id,si.product_name
      ORDER BY amount DESC
      LIMIT 15`, baseArgs),
    pool.execute<ServiceSummaryRow[]>(`
      SELECT jos.service_name, COUNT(*) jobs,
             COALESCE(SUM(jos.service_charge),0) amount,
             COALESCE(SUM(jos.owner_share),0) owner_share,
             COALESCE(SUM(jos.mechanic_share),0) mechanic_share
      FROM sales s
      JOIN job_orders jo ON jo.id=s.job_order_id
      JOIN job_order_services jos ON jos.job_order_id=jo.id AND jos.status<>'CANCELLED'
      WHERE ${baseWhere}
      GROUP BY jos.service_id,jos.service_name
      ORDER BY amount DESC
      LIMIT 15`, baseArgs),
    pool.execute<PaymentRow[]>(`
      SELECT s.payment_method,COUNT(*) transactions,COALESCE(SUM(s.total_amount),0) amount
      FROM sales s WHERE ${baseWhere}
      GROUP BY s.payment_method ORDER BY amount DESC`, baseArgs),
    pool.execute<SaleRow[]>(`
      SELECT s.id,s.sale_number,s.sale_date,c.client_name,m.plate_number,jo.job_order_number,u.full_name cashier_name,
             s.payment_method,s.status,s.subtotal,s.discount_amount,s.total_amount
      FROM sales s
      LEFT JOIN clients c ON c.id=s.client_id
      LEFT JOIN motorcycles m ON m.id=s.motorcycle_id
      LEFT JOIN job_orders jo ON jo.id=s.job_order_id
      LEFT JOIN users u ON u.id=s.cashier_id
      WHERE ${baseWhere}
        AND (CAST(? AS CHAR CHARACTER SET utf8mb4)=''
          OR s.sale_number COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
          OR COALESCE(c.client_name,'') COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
          OR COALESCE(m.plate_number,'') COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
          OR COALESCE(jo.job_order_number,'') COLLATE utf8mb4_unicode_ci LIKE CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
      ORDER BY s.sale_date DESC,s.id DESC
      LIMIT 500`, [...baseArgs,q,like,like,like,like])
  ]);

  const summary=summaryRows[0]??{transactions:0,gross_sales:0,discounts:0,net_sales:0,amount_tendered:0};
  const productRevenue=products.reduce((a,r)=>a+Number(r.amount),0);
  const productCost=products.reduce((a,r)=>a+Number(r.estimated_cost),0);
  const serviceRevenue=services.reduce((a,r)=>a+Number(r.amount),0);
  const estimatedGrossProfit=(productRevenue-productCost)+services.reduce((a,r)=>a+Number(r.owner_share),0);

  return <main className={styles.page}>
    <div className={styles.noPrint}><Link href="/reports" className={styles.back}><ArrowLeft size={17}/> Reports</Link></div>

    <section className={styles.reportHeader}>
      <div><div className={styles.eyebrow}>KL Motor Shop</div><h1>Sales Report</h1><p>{from} to {to}</p></div>
      <div className={styles.headerMeta}><span>Prepared by</span><strong>{user.fullName}</strong><small>{user.role}</small></div>
    </section>

    <form className={`${styles.filters} ${styles.noPrint}`}>
      <label>From<input type="date" name="from" defaultValue={from}/></label>
      <label>To<input type="date" name="to" defaultValue={to}/></label>
      <label>Payment<select name="payment" defaultValue={payment}><option value="">All payments</option>{["CASH","GCASH","BANK_TRANSFER","CARD","OTHER"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={status}><option value="">All statuses</option>{["COMPLETED","VOIDED","REFUNDED"].map(v=><option key={v}>{v}</option>)}</select></label>
      <label className={styles.search}>Search<input name="q" defaultValue={q} placeholder="Receipt, client, plate, JO..."/></label>
      <button type="submit">Apply Filters</button><PrintButton/>
    </form>

    <section className={styles.metrics}>
      <article><ReceiptText/><span>Transactions</span><strong>{Number(summary.transactions)}</strong></article>
      <article><BarChart3/><span>Net Sales</span><strong>{php(summary.net_sales)}</strong></article>
      <article><CreditCard/><span>Discounts</span><strong>{php(summary.discounts)}</strong></article>
      <article><PackageCheck/><span>Product Sales</span><strong>{php(productRevenue)}</strong></article>
      <article><Wrench/><span>Service Sales</span><strong>{php(serviceRevenue)}</strong></article>
      <article><CalendarDays/><span>Est. Gross Profit</span><strong>{php(estimatedGrossProfit)}</strong></article>
    </section>

    <section className={styles.twoCol}>
      <article className={styles.panel}><header><div><p>Sales mix</p><h2>Payment Methods</h2></div></header>{payments.length?<div className={styles.list}>{payments.map(r=><div key={r.payment_method}><span><strong>{r.payment_method.replaceAll("_"," ")}</strong><small>{Number(r.transactions)} transaction(s)</small></span><strong>{php(r.amount)}</strong></div>)}</div>:<p className={styles.empty}>No payment records in this range.</p>}</article>
      <article className={styles.panel}><header><div><p>Profit view</p><h2>Revenue Breakdown</h2></div></header><div className={styles.list}><div><span><strong>Product Revenue</strong><small>Parts/items sold</small></span><strong>{php(productRevenue)}</strong></div><div><span><strong>Estimated Product Cost</strong><small>From sold batch costs</small></span><strong>{php(productCost)}</strong></div><div><span><strong>Service Revenue</strong><small>Job Order services</small></span><strong>{php(serviceRevenue)}</strong></div><div><span><strong>Estimated Gross Profit</strong><small>Product margin + owner service share</small></span><strong>{php(estimatedGrossProfit)}</strong></div></div></article>
    </section>

    <section className={styles.twoCol}>
      <article className={styles.panel}><header><div><p>Top 15</p><h2>Products Sold</h2></div></header>{products.length?<div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Qty</th><th>Sales</th></tr></thead><tbody>{products.map(r=><tr key={r.product_name}><td>{r.product_name}</td><td>{Number(r.quantity).toFixed(2)}</td><td>{php(r.amount)}</td></tr>)}</tbody></table></div>:<p className={styles.empty}>No product sales.</p>}</article>
      <article className={styles.panel}><header><div><p>Top 15</p><h2>Services Sold</h2></div></header>{services.length?<div className={styles.tableWrap}><table><thead><tr><th>Service</th><th>Jobs</th><th>Sales</th></tr></thead><tbody>{services.map(r=><tr key={r.service_name}><td>{r.service_name}</td><td>{Number(r.jobs)}</td><td>{php(r.amount)}</td></tr>)}</tbody></table></div>:<p className={styles.empty}>No service sales.</p>}</article>
    </section>

    <section className={styles.panel}><header><div><p>Transaction details</p><h2>Sales</h2></div><span>{sales.length} record(s)</span></header>{sales.length?<div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Receipt</th><th>Customer / Motorcycle</th><th>Job Order</th><th>Cashier</th><th>Payment</th><th>Status</th><th className={styles.amount}>Total</th></tr></thead><tbody>{sales.map(r=><tr key={r.id}><td>{dateTime(r.sale_date)}</td><td><strong>{r.sale_number}</strong></td><td>{r.client_name??"Walk-in"}<small>{r.plate_number??"—"}</small></td><td>{r.job_order_number??"Direct Sale"}</td><td>{r.cashier_name??"—"}</td><td>{r.payment_method.replaceAll("_"," ")}</td><td>{r.status}</td><td className={styles.amount}><strong>{php(r.total_amount)}</strong></td></tr>)}</tbody></table></div>:<p className={styles.empty}>No sales match the selected filters.</p>}</section>

    <footer className={styles.printFooter}>KL Motor Shop • Sales Report • Generated {new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short"}).format(new Date())}</footer>
  </main>;
}
