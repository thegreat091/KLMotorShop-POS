import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Barcode, PackageCheck, Printer } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "../stock-in.module.css";

interface HeaderRow extends RowDataPacket { id:number; reference_number:string; transaction_date:Date; supplier_name:string|null; supplier_reference:string|null; remarks:string|null; }
interface ItemRow extends RowDataPacket { id:number; product_code:string; product_name:string; unit:string; quantity:number; unit_cost:number; subtotal:number; batch_number:string; barcode:string; quantity_remaining:number; selling_price:number; }
function peso(value:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value)}

export default async function StockInDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{success?:string}> }) {
  const user=await getCurrentUser(); if(!user)redirect("/"); if(!["ADMIN","INVENTORY","OWNER"].includes(user.role))redirect("/dashboard");
  const {id}=await params; const stockInId=Number(id); if(!Number.isInteger(stockInId)||stockInId<=0)notFound(); const query=await searchParams;
  const [headers]=await pool.query<HeaderRow[]>(`SELECT st.id,st.reference_number,st.transaction_date,st.remarks,s.supplier_name,sim.supplier_reference FROM stock_transactions st LEFT JOIN suppliers s ON s.id=st.supplier_id LEFT JOIN stock_in_meta sim ON sim.stock_transaction_id=st.id WHERE st.id=? AND st.transaction_type='STOCK_IN' LIMIT 1`,[stockInId]);
  const header=headers[0]; if(!header)notFound();
  const [items]=await pool.query<ItemRow[]>(`SELECT sti.id,p.product_code,p.product_name,p.unit,sti.quantity,sti.unit_cost,sti.subtotal,sib.batch_number,sib.barcode,sib.quantity_remaining,sib.selling_price FROM stock_transaction_items sti JOIN products p ON p.id=sti.product_id JOIN stock_in_batches sib ON sib.stock_transaction_item_id=sti.id WHERE sti.stock_transaction_id=? ORDER BY sti.id`,[stockInId]);
  const total=items.reduce((sum,item)=>sum+Number(item.subtotal),0); const labels=items.reduce((sum,item)=>sum+Number(item.quantity),0);
  return <main className={styles.page}><header className={styles.hero}><div><Link href="/inventory/stock-in" className={styles.backButton}><ArrowLeft size={19}/> Stock In</Link><div className={styles.titleBlock}><div className={styles.titleIcon}><PackageCheck size={28}/></div><div><p>Stock In Details</p><h1>{header.reference_number}</h1><span>{new Date(header.transaction_date).toLocaleString("en-PH")}</span></div></div></div><Link href={`/inventory/stock-in/${stockInId}/labels`} className={styles.addButton}><Printer size={19}/> Print {labels} Labels</Link></header>
  <section className={styles.content}>{query.success?<div className={styles.successMessage}>{query.success}</div>:null}<div className={styles.detailGrid}><article><span>Supplier</span><strong>{header.supplier_name??"No supplier"}</strong></article><article><span>Supplier Reference</span><strong>{header.supplier_reference??"—"}</strong></article><article><span>Total Cost</span><strong>{peso(total)}</strong></article><article><span>Barcode Labels</span><strong>{labels}</strong></article></div>
  <section className={styles.panel}><header className={styles.panelHeader}><div><p>Batch Details</p><h2>Received products</h2></div></header><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product</th><th>Batch</th><th>Barcode</th><th>Qty Received</th><th>Qty Remaining</th><th>Unit Cost</th><th>Selling</th><th>Subtotal</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.product_code}</strong><br/><span>{item.product_name}</span></td><td>{item.batch_number}</td><td><span className={styles.barcodeValue}><Barcode size={15}/>{item.barcode}</span></td><td>{Number(item.quantity)} {item.unit}</td><td>{Number(item.quantity_remaining)} {item.unit}</td><td>{peso(Number(item.unit_cost))}</td><td>{peso(Number(item.selling_price))}</td><td><strong>{peso(Number(item.subtotal))}</strong></td></tr>)}</tbody></table></div></section>
  {header.remarks?<div className={styles.notes}><strong>Remarks</strong><p>{header.remarks}</p></div>:null}</section></main>;
}
