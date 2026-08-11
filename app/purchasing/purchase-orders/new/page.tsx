import type { RowDataPacket } from "mysql2";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createPurchaseOrderAction } from "../../actions";
import styles from "./new-po.module.css";

interface Supplier extends RowDataPacket{id:number;supplier_name:string}
interface Product extends RowDataPacket{id:number;product_code:string;product_name:string;cost_price:number;quantity_on_hand:number;reorder_level:number;supplier_id:number|null}
type Params={error?:string};

export default async function NewPO({searchParams}:{searchParams:Promise<Params>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/dashboard");
 const p=await searchParams;
 const [suppliers]=await pool.query<Supplier[]>("SELECT id,supplier_name FROM suppliers WHERE is_active=1 ORDER BY supplier_name");
 const [products]=await pool.query<Product[]>("SELECT id,product_code,product_name,cost_price,quantity_on_hand,reorder_level,supplier_id FROM products WHERE is_active=1 ORDER BY product_name");
 return <main className={styles.page}>
 <div className={styles.topbar}><Link href="/purchasing/purchase-orders"><ArrowLeft size={17}/>Purchase Orders</Link></div>
 {p.error?<div className={styles.error}>{p.error}</div>:null}
 <section className={styles.card}><h1>New Purchase Order</h1><form action={createPurchaseOrderAction} className={styles.form}>
 <label>Supplier<select name="supplier_id" required><option value="">Select supplier...</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></label>
 <label>Expected Date<input type="date" name="expected_date"/></label>
 <label className={styles.full}>Remarks<textarea name="remarks" rows={2}/></label>

 <div className={styles.full}><h2>Items</h2><p>Select products and enter quantity to order. Leave quantity 0 for products not included.</p></div>
 <div className={`${styles.full} ${styles.tableWrap}`}><table><thead><tr><th>Product</th><th>On Hand</th><th>Reorder</th><th>Qty Order</th><th>Unit Cost</th></tr></thead><tbody>
 {products.map(prod=><tr key={prod.id}><td><input type="hidden" name="product_id" value={prod.id}/><strong>{prod.product_name}</strong><small>{prod.product_code}</small></td><td>{Number(prod.quantity_on_hand).toFixed(2)}</td><td>{Number(prod.reorder_level).toFixed(2)}</td><td><input type="number" name="quantity" min="0" step="0.01" defaultValue={0}/></td><td><input type="number" name="unit_cost" min="0" step="0.01" defaultValue={Number(prod.cost_price).toFixed(2)}/></td></tr>)}
 </tbody></table></div>
 <button type="submit">Create Purchase Order</button>
 </form></section></main>
}
