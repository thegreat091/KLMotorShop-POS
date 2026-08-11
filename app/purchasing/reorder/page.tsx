import type { RowDataPacket } from "mysql2";
import { ArrowLeft, PackageSearch } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./reorder.module.css";

interface Row extends RowDataPacket {
  id:number;
  product_code:string;
  product_name:string;
  category_name:string|null;
  brand_name:string|null;
  supplier_name:string|null;
  quantity_on_hand:number;
  reorder_level:number;
  cost_price:number;
}

export default async function ReorderPage() {
  const user=await getCurrentUser();
  if(!user) redirect("/");
  if(!["ADMIN","OWNER","INVENTORY"].includes(user.role)) redirect("/dashboard");

  const [rows]=await pool.query<Row[]>(`
    SELECT
      p.id,p.product_code,p.product_name,
      pc.category_name,pb.brand_name,s.supplier_name,
      p.quantity_on_hand,p.reorder_level,p.cost_price
    FROM products p
    LEFT JOIN product_categories pc ON pc.id=p.category_id
    LEFT JOIN product_brands pb ON pb.id=p.brand_id
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE p.is_active=1
      AND p.quantity_on_hand <= p.reorder_level
    ORDER BY
      CASE WHEN p.quantity_on_hand <= 0 THEN 0 ELSE 1 END,
      (p.reorder_level-p.quantity_on_hand) DESC,
      p.product_name
  `);

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/purchasing"><ArrowLeft size={17}/>Purchasing</Link><Link href="/purchasing/purchase-orders/new">Create Purchase Order</Link></div>
    <section className={styles.hero}><div><span>Purchasing</span><h1>Needs Reorder</h1><p>Products whose current stock is at or below the reorder level.</p></div><PackageSearch size={44}/></section>
    <section className={styles.card}>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Brand</th><th>Supplier</th><th>On Hand</th><th>Reorder Level</th><th>Suggested Order</th><th>Cost</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r=>{
              const suggested=Math.max(0, Number(r.reorder_level)*2-Number(r.quantity_on_hand));
              const out=Number(r.quantity_on_hand)<=0;
              return <tr key={r.id}>
                <td><strong>{r.product_name}</strong><small>{r.product_code}</small></td>
                <td>{r.category_name??"—"}</td>
                <td>{r.brand_name??"—"}</td>
                <td>{r.supplier_name??"—"}</td>
                <td>{Number(r.quantity_on_hand).toFixed(2)}</td>
                <td>{Number(r.reorder_level).toFixed(2)}</td>
                <td><strong>{suggested.toFixed(2)}</strong></td>
                <td>₱{Number(r.cost_price).toFixed(2)}</td>
                <td><span className={out?styles.out:styles.low}>{out?"OUT OF STOCK":"LOW STOCK"}</span></td>
              </tr>
            })}
            {!rows.length?<tr><td colSpan={9} className={styles.empty}>No products currently need reordering.</td></tr>:null}
          </tbody>
        </table>
      </div>
    </section>
  </main>
}
