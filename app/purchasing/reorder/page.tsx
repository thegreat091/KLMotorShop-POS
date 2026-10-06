import type { RowDataPacket } from "mysql2";
import { ArrowLeft, PackageSearch } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./print-button";
import styles from "./reorder.module.css";

interface Row extends RowDataPacket {
  id:number; product_code:string; product_name:string; category_name:string|null; brand_name:string|null;
  supplier_id:number|null; supplier_name:string|null; contact_person:string|null; mobile_number:string|null;
  telephone_number:string|null; address:string|null; unit:string; quantity_on_hand:number; reorder_level:number;
  cost_price:number; qty_sold_30:number;
}

type Movement = "FAST SELLING"|"NORMAL SELLING"|"SLOW SELLING"|"NO RECENT SALES";
function movement(qty:number, fastCut:number, normalCut:number):Movement {
  if(qty<=0) return "NO RECENT SALES";
  if(qty>=fastCut) return "FAST SELLING";
  if(qty>=normalCut) return "NORMAL SELLING";
  return "SLOW SELLING";
}
function movementRank(value:Movement){ return value==="FAST SELLING"?0:value==="NORMAL SELLING"?1:value==="SLOW SELLING"?2:3; }
function printedAt(){ return new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date()); }

export default async function ReorderPage() {
  const user=await getCurrentUser();
  if(!user) redirect("/");
  if(!["ADMIN","OWNER","INVENTORY"].includes(user.role)) redirect("/dashboard");

  const [rows]=await pool.query<Row[]>(`
    SELECT p.id,p.product_code,p.product_name,pc.category_name,pb.brand_name,
      p.supplier_id,s.supplier_name,s.contact_person,s.mobile_number,s.telephone_number,s.address,
      p.unit,p.quantity_on_hand,p.reorder_level,p.cost_price,
      COALESCE(SUM(CASE WHEN sa.status='COMPLETED' AND sa.sale_date>=DATE_SUB(NOW(),INTERVAL 30 DAY) THEN si.quantity ELSE 0 END),0) qty_sold_30
    FROM products p
    LEFT JOIN product_categories pc ON pc.id=p.category_id
    LEFT JOIN product_brands pb ON pb.id=p.brand_id
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    LEFT JOIN sale_items si ON si.product_id=p.id
    LEFT JOIN sales sa ON sa.id=si.sale_id
    WHERE p.is_active=1 AND p.quantity_on_hand<=p.reorder_level
    GROUP BY p.id,p.product_code,p.product_name,pc.category_name,pb.brand_name,p.supplier_id,s.supplier_name,s.contact_person,s.mobile_number,s.telephone_number,s.address,p.unit,p.quantity_on_hand,p.reorder_level,p.cost_price
  `);

  const positive=rows.map(r=>Number(r.qty_sold_30)).filter(q=>q>0).sort((a,b)=>a-b);
  const percentile=(p:number)=>positive.length?positive[Math.min(positive.length-1,Math.floor((positive.length-1)*p))]:0;
  const fastCut=Math.max(1,percentile(.67));
  const normalCut=Math.max(1,percentile(.34));
  const prepared=rows.map(r=>({...r,movement:movement(Number(r.qty_sold_30),fastCut,normalCut)}));
  const groups=new Map<string,typeof prepared>();
  for(const r of prepared){const key=r.supplier_id?String(r.supplier_id):"none"; if(!groups.has(key)) groups.set(key,[]); groups.get(key)!.push(r);}
  const grouped=[...groups.entries()].sort((a,b)=>{
    if(a[0]==="none") return 1;if(b[0]==="none") return -1;
    return (a[1][0].supplier_name??"").localeCompare(b[1][0].supplier_name??"");
  });
  grouped.forEach(([,items])=>items.sort((a,b)=>movementRank(a.movement)-movementRank(b.movement)||Number(b.qty_sold_30)-Number(a.qty_sold_30)||a.product_name.localeCompare(b.product_name)));

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/purchasing"><ArrowLeft size={17}/>Purchasing</Link><div className={styles.actions}><PrintButton/>{user.role==="OWNER"?<Link href="/purchasing/purchase-orders/new">Create Purchase Order</Link>:null}</div></div>
    <section className={styles.hero}><div><span>Purchasing</span><h1>Needs Reorder</h1><p>Products whose current stock is at or below the reorder level, grouped by supplier.</p></div><PackageSearch size={44}/></section>
    <section className={styles.printHeader}><h1>KL MOTOR SHOP</h1><h2>NEEDS REORDER – PURCHASING LIST</h2><p>Printed: {printedAt()} · Sales movement: completed POS sales during the last 30 days</p></section>
    <div className={styles.summary}><strong>{rows.length}</strong><span>products need reorder</span><strong>{grouped.length}</strong><span>supplier groups</span></div>
    {!rows.length?<section className={styles.card}><div className={styles.empty}>No products currently need reordering.</div></section>:null}
    {grouped.map(([key,items])=>{const first=items[0]; const supplier=key==="none"?"NO SUPPLIER ASSIGNED":first.supplier_name??"NO SUPPLIER ASSIGNED"; return <section className={styles.card} key={key}>
      <header className={styles.supplierHeader}><div><span>Supplier</span><h2>{supplier}</h2>{key!=="none"?<p>{[first.contact_person,first.mobile_number||first.telephone_number,first.address].filter(Boolean).join(" · ")}</p>:<p>Assign a supplier to these products for easier purchasing.</p>}</div><strong>{items.length} item{items.length===1?"":"s"}</strong></header>
      <div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Category</th><th>On Hand</th><th>Reorder</th><th>Sold 30D</th><th>Sales Movement</th><th>Suggested</th><th className={styles.orderQty}>Order Qty</th><th className={styles.screenOnly}>Cost</th><th>Status</th></tr></thead><tbody>
      {items.map(r=>{const suggested=Math.max(0,Number(r.reorder_level)*2-Number(r.quantity_on_hand));const out=Number(r.quantity_on_hand)<=0;return <tr key={r.id}><td><strong>{r.product_name}</strong><small>{r.product_code}{r.brand_name?` · ${r.brand_name}`:""}</small></td><td>{r.category_name??"—"}</td><td>{Number(r.quantity_on_hand).toFixed(2)} {r.unit}</td><td>{Number(r.reorder_level).toFixed(2)}</td><td><strong>{Number(r.qty_sold_30).toFixed(2)}</strong></td><td><span className={`${styles.movement} ${styles[r.movement.toLowerCase().replaceAll(" ","_")]}`}>{r.movement}</span></td><td><strong>{suggested.toFixed(2)}</strong></td><td className={styles.orderQty}><span className={styles.writeLine}></span></td><td className={styles.screenOnly}>₱{Number(r.cost_price).toFixed(2)}</td><td><span className={out?styles.out:styles.low}>{out?"OUT":"LOW"}</span></td></tr>})}
      </tbody></table></div>
    </section>})}
  </main>;
}
